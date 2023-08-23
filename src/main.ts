import * as core from '@actions/core'
import * as coreCommand from '@actions/core/lib/command'
import * as github from '@actions/github'
import * as path from 'path'
import * as gitSourceProvider from './externals/checkout-action/src/git-source-provider'
import * as inputHelper from './externals/checkout-action/src/input-helper'
import * as stateHelper from './externals/checkout-action/src/state-helper'

async function run(): Promise<void> {
  const pr_base: string | undefined =
    github.context.payload.pull_request?.base.sha

  if (!pr_base) {
    core.setFailed(`Failed to determine PR base. Abort.`)
    return
  }

  const pr_target_head: string | undefined =
    github.context.payload.pull_request?.head.sha
  if (pr_target_head !== pr_base) {
    core.setFailed(
      `PR base (${pr_base}) is not the same as target branch head (${pr_target_head}). This is unsupported at the moment, please rebase your branch.`
    )
    return
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

// Main
if (!stateHelper.IsPost) {
  run()
}
// Post
else {
  cleanup()
}
