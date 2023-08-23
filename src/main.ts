import * as core from '@actions/core'
import * as coreCommand from '@actions/core/lib/command'
import * as github from '@actions/github'
import * as gitSourceProvider from './externals/checkout-action/src/git-source-provider'
import * as inputHelper from './externals/checkout-action/src/input-helper'
import * as path from 'path'
import * as stateHelper from './externals/checkout-action/src/state-helper'
import {GitCommandManager} from './externals/checkout-action/src/git-command-manager'
import {IGitSourceSettings} from './externals/checkout-action/src/git-source-settings'

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

    const confRepository = await setupGitRepository(sourceSettings)

    core.startGroup('Fetch base and head')
    await confRepository.fetch([pr_context.base.sha, pr_context.head.sha], {})
    core.endGroup()

    // We should be able to use `pr_context.merge_base` but Gitea sends a outdated one
    const mergeBase = (
      await confRepository.execGit([
        'merge-base',
        pr_context.base.sha,
        pr_context.head.sha
      ])
    ).stdout.trim()
    if (mergeBase !== pr_context.base.sha) {
      core.setFailed(
        `Merge base between PR Base (${pr_context.base.sha}) and PR head (${pr_context.head.sha}) is different from PR base current head (found merge-base ${mergeBase}). This is unsupported at the moment, please rebase your branch.`
      )
      return
    }
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
}

async function setupGitRepository(
  sourceSettings: IGitSourceSettings
): Promise<GitCommandManager> {
  core.startGroup('Setup conf repository')
  try {
    // Register github action problem matcher
    coreCommand.issueCommand(
      'add-matcher',
      {},
      path.join(__dirname, 'checkout-action-problem-matcher.json')
    )

    // Force depth 1 as we need to get history for 2 branches,
    // which is not handle by checkout-action
    sourceSettings.fetchDepth = 1
    // Setup repository
    await gitSourceProvider.getSource(sourceSettings)

    const git = await GitCommandManager.createCommandManager(
      sourceSettings.repositoryPath,
      sourceSettings.lfs,
      sourceSettings.sparseCheckout != null
    )

    return git
  } finally {
    // Unregister problem matcher
    coreCommand.issueCommand('remove-matcher', {owner: 'checkout-git'}, '')

    core.endGroup()
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
