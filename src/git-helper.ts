import * as core from '@actions/core'
import * as coreCommand from '@actions/core/lib/command'
import * as path from 'path'
import * as gitSourceProvider from './externals/checkout-action/src/git-source-provider'
import {GitCommandManager} from './externals/checkout-action/src/git-command-manager'
import {IGitSourceSettings} from './externals/checkout-action/src/git-source-settings'

export async function setupGitRepository(
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

export async function getMergeBase(
  repository: GitCommandManager,
  commits: string[]
): Promise<string> {
  const output = await repository.execGit(['merge-base'].concat(commits))
  return output.stdout.trim()
}
