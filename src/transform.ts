import {PullRequestInfo, sortPullRequests} from './pullRequests'
import * as core from '@actions/core'
import {
  Category,
  Configuration,
  Transformer,
  DefaultConfiguration
} from './configuration'

export function buildChangelog(
  prs: PullRequestInfo[],
  config: Configuration
): string {
  // sort to target order
  const sort = config.sort || DefaultConfiguration.sort
  const sortAsc = sort.toUpperCase() === 'ASC'
  prs = sortPullRequests(prs, sortAsc)
  core.info(`ℹ️ Sorted all pull requests ascending: ${sort}`)

  const validatedTransformers = validateTransfomers(config.transformers)
  const transformedMap = new Map<PullRequestInfo, string>()
  // convert PRs to their text representation
  for (const pr of prs) {
    transformedMap.set(
      pr,
      transform(
        fillTemplate(
          pr,
          config.pr_template
            ? config.pr_template
            : DefaultConfiguration.pr_template
        ),
        validatedTransformers
      )
    )
  }
  core.info(
    `ℹ️ Used ${validateTransfomers.length} transformers to adjust message`
  )
  core.info(`✒️ Wrote messages for ${prs.length} pull requests`)

  // bring PRs into the order of categories
  const categorized = new Map<Category, string[]>()
  const categories = config.categories || DefaultConfiguration.categories
  for (const category of categories) {
    categorized.set(category, [])
  }
  const uncategorized: string[] = []

  // bring elements in order
  for (const [pr, body] of transformedMap) {
    let matched = false

    for (const [category, pullRequests] of categorized) {
      if (haveCommonElements(category.labels, pr.labels)) {
        pullRequests.push(body)
        matched = true
      }
    }

    if (!matched) {
      uncategorized.push(body)
    }
  }
  core.info(`ℹ️ Ordered all pull requests into ${categories.length} categories`)

  // construct final changelog
  let changelog = ''
  for (const [category, pullRequests] of categorized) {
    if (pullRequests.length > 0) {
      changelog = `${changelog + category.title}\n\n`

      for (const pr of pullRequests) {
        changelog = `${changelog + pr}\n`
      }

      // add space between
      changelog = `${changelog}\n`
    }
  }
  core.info(`✒️ Wrote ${categorized.size} categorized pull requests down`)

  let changelogUncategorized = ''
  for (const pr of uncategorized) {
    changelogUncategorized = `${changelogUncategorized + pr}\n`
  }
  core.info(
    `✒️ Wrote ${uncategorized.length} non categorized pull requests down`
  )

  // fill template
  let transformedChangelog = config.template || DefaultConfiguration.template
  transformedChangelog = transformedChangelog.replace(
    '${{CHANGELOG}}',
    changelog
  )
  transformedChangelog = transformedChangelog.replace(
    '${{UNCATEGORIZED}}',
    changelogUncategorized
  )
  core.info(`ℹ️ Filled template`)
  return transformedChangelog
}

function haveCommonElements(arr1: string[], arr2: string[]): Boolean {
  return arr1.some(item => arr2.includes(item))
}

function fillTemplate(pr: PullRequestInfo, template: string): string {
  let transformed = template
  transformed = transformed.replace('${{NUMBER}}', pr.number.toString())
  transformed = transformed.replace('${{TITLE}}', pr.title)
  transformed = transformed.replace('${{URL}}', pr.htmlURL)
  transformed = transformed.replace('${{MERGED_AT}}', pr.mergedAt.toISOString())
  transformed = transformed.replace('${{AUTHOR}}', pr.author)
  transformed = transformed.replace('${{LABELS}}', pr.labels?.join(', ') || '')
  transformed = transformed.replace('${{MILESTONE}}', pr.milestone || '')
  transformed = transformed.replace('${{BODY}}', pr.body)
  transformed = transformed.replace(
    '${{ASSIGNEES}}',
    pr.assignees?.join(', ') || ''
  )
  transformed = transformed.replace(
    '${{REVIEWERS}}',
    pr.requestedReviewers?.join(', ') || ''
  )
  return transformed
}

function transform(filled: string, transformers: RegexTransformer[]): string {
  if (transformers.length === 0) {
    return filled
  }
  let transformed = filled
  for (const {target, pattern} of transformers) {
    transformed = transformed.replace(pattern!!, target)
  }
  return transformed
}

function validateTransfomers(
  specifiedTransformers: Transformer[]
): RegexTransformer[] {
  const transformers =
    specifiedTransformers || DefaultConfiguration.transformers
  return transformers
    .map(transformer => {
      try {
        return {
          pattern: new RegExp(transformer.pattern.replace('\\\\', '\\'), 'g'),
          target: transformer.target
        }
      } catch (e) {
        core.warning(`⚠️ Bad replacer regex: ${transformer.pattern}`)
        return {
          pattern: null,
          target: ''
        }
      }
    })
    .filter(transformer => transformer.pattern != null)
}

interface RegexTransformer {
  pattern: RegExp | null
  target: string
}
