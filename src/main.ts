import * as core from '@actions/core'
import * as github from '@actions/github'
import * as gitSourceProvider from './externals/checkout-action/src/git-source-provider'
import * as inputHelper from './externals/checkout-action/src/input-helper'
import * as stateHelper from './externals/checkout-action/src/state-helper'
import * as gitHelper from './git-helper'
import * as buildbotExport from './buildbot-export'

async function run(): Promise<void> {
  const pr_context = github.context.payload.pull_request
  if (!pr_context) {
    core.setFailed('PR context is unset. Abort.')
    return
  }

  if (pr_context.merged) {
    core.info('PR already merged. Early out.')
    return
  }

  if (!pr_context.base.sha) {
    core.setFailed(`Failed to retrieve PR base from context. Abort.`)
    return
  }
  if (!pr_context.head.sha) {
    core.setFailed(`Failed to retrieve PR head from context. Abort.`)
    return
  }

  try {
    // Use github checkout action getInputs to retrieve default and maybe expose some
    // in the future is relevant
    const sourceSettings = await inputHelper.getInputs()
    // override some to match needed behaviour
    sourceSettings.persistCredentials = true
    // Start at branch point to generate base config export
    sourceSettings.commit = pr_context.base.sha

    const configurationRepository = await gitHelper.setupGitRepository(
      sourceSettings
    )

    core.startGroup('Fetch base and head')
    await configurationRepository.fetch(
      [pr_context.base.sha, pr_context.head.sha],
      {}
    )
    core.endGroup()

    // We should be able to use `pr_context.merge_base` but Gitea sends a outdated one
    const mergeBase = await gitHelper.getMergeBase(configurationRepository, [
      pr_context.base.sha,
      pr_context.head.sha
    ])
    if (mergeBase !== pr_context.base.sha) {
      core.setFailed(
        `Merge base between PR Base (${pr_context.base.sha}) and PR head (${pr_context.head.sha}) is different from PR base current head (found merge-base ${mergeBase}). This is unsupported at the moment, please rebase your branch.`
      )
      return
    }

    const result = await buildbotExport.exportPullRequestConfiguration(
      configurationRepository,
      pr_context.base.sha,
      pr_context.head.sha,
      core.getBooleanInput('fast-export'),
      core.getInput('repository-output')
    )

    core.info(
      `Finished config export. ${result.baseExportedSha} to ${result.headExportedSha}`
    )

    core.setOutput('base-exported-sha', result.baseExportedSha)
    core.setOutput('head-exported-sha', result.headExportedSha)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

async function cleanup(): Promise<void> {
  try {
    await gitSourceProvider.cleanup(stateHelper.RepositoryPath)
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    core.warning(`${(error as any)?.message ?? error}`)
  }
  try {
    await gitSourceProvider.cleanup(buildbotExport.EXPORT_REPOSITORY_PATH)
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    core.warning(`${(error as any)?.message ?? error}`)
  }
}

// Main
if (!stateHelper.IsPost) {
  run()
}
// Post
else {
  cleanup()
}
