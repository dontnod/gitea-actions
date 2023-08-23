import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as fsHelper from './externals/checkout-action/src/fs-helper'
import * as io from '@actions/io'
import {GitCommandManager} from './externals/checkout-action/src/git-command-manager'

export const EXPORT_REPOSITORY_PATH = `/tmp/${github.context.job}/${github.context.runNumber}`

export async function exportPullRequestConfiguration(
  configurationRepository: GitCommandManager,
  baseSha: string,
  headSha: string,
  fast = false,
  outputRepositoryUrl?: string
): Promise<{baseExportedSha: string; headExportedSha: string}> {
  const exportRepository = await initExportRepo()

  // Do a first export on base commit
  await configurationRepository.checkout(baseSha, '')
  await runExportConfiguration(exportRepository, configurationRepository)

  // NOTE(TDS): Tag this commit?
  const baseExportedSha = await exportRepository.revParse('HEAD')

  const commitList = fast
    ? [headSha]
    : await getCommitList(configurationRepository, baseSha, headSha)

  for (const commit of commitList) {
    await configurationRepository.checkout(commit, '')
    await runExportConfiguration(exportRepository, configurationRepository)
  }

  const headExportedSha = await exportRepository.revParse('HEAD')

  if (outputRepositoryUrl) {
    const branchName = `${github.context.job}/${github.context.runNumber}`
    exportRepository.execGit([
      'push',
      '--force',
      outputRepositoryUrl,
      `HEAD:${branchName}`
    ])
  }

  return {baseExportedSha, headExportedSha}
}

async function initExportRepo(): Promise<GitCommandManager> {
  core.startGroup('Initialize export repository')

  // Remove conflicting file path
  if (fsHelper.fileExistsSync(EXPORT_REPOSITORY_PATH)) {
    await io.rmRF(EXPORT_REPOSITORY_PATH)
  }

  // Create directory
  if (!fsHelper.directoryExistsSync(EXPORT_REPOSITORY_PATH)) {
    await io.mkdirP(EXPORT_REPOSITORY_PATH)
  }

  const git = await GitCommandManager.createCommandManager(
    EXPORT_REPOSITORY_PATH,
    false,
    false
  )

  await git.init()

  core.endGroup()
  return git
}

async function getPrettyCommitMessage(git: GitCommandManager): Promise<string> {
  core.startGroup('Generate pretty commit for exported configuration')
  const logOutput = await git.execGit([
    'log',
    '--no-decorate',
    '--oneline',
    '-1'
  ])
  core.endGroup()
  return logOutput.stdout.trim()
}

async function getCommitList(
  git: GitCommandManager,
  base: string,
  head: string
): Promise<string[]> {
  core.startGroup(`Get commits included in range ]${base}, ${head}]`)
  const args = ['rev-list', '--reverse', '--first-parent', `${base}...${head}`]
  const output = await git.execGit(args)
  core.endGroup()
  return output.stdout.trim().split('\n')
}

async function runExportConfiguration(
  exportRepository: GitCommandManager,
  configurationRepository: GitCommandManager
): Promise<void> {
  core.startGroup('Export Configuration')

  core.startGroup('Remove previously exported configuration')
  const gitRmArgs = [
    'rm',
    '--quiet',
    '-r',
    '--force',
    '--ignore-unmatch',
    '--',
    '*'
  ]
  // Remove previous export
  await exportRepository.execGit(gitRmArgs)
  core.endGroup()

  core.startGroup('Find Python2 exe')
  let python2Path
  try {
    python2Path = await io.which('python2', true)
  } catch {
    python2Path = await io.which('python', true)
  }
  core.endGroup()

  core.startGroup('Run exporter')
  const exportArgs = [
    '-m',
    'administration.master_config_utils',
    'export',
    '--skip-check',
    '--tree',
    '-o',
    exportRepository.getWorkingDirectory()
  ]
  await exec.exec(python2Path, exportArgs, {
    cwd: configurationRepository.getWorkingDirectory()
  })
  core.endGroup()

  core.startGroup('Add exported configuration')
  const gitAddArgs = ['add', '--force', '--', '.']
  await exportRepository.execGit(gitAddArgs)
  core.endGroup()

  core.startGroup('Commit exported configuration')
  const commitMessage = await getPrettyCommitMessage(configurationRepository)

  const gitCommitArgs = [
    '-c',
    `user.email=${github.context.actor}@noreply.com`,
    '-c',
    `user.name=${github.context.actor}`,
    'commit',
    '-m',
    `${commitMessage.replace('"', '\\"')}`
  ]
  await exportRepository.execGit(gitCommitArgs)
  core.endGroup()

  core.endGroup()
}
