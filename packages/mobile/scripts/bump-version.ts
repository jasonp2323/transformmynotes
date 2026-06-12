/**
 * bump-version.ts — CLI script to sync versionName from the root package.json
 * and increment versionCode in android/app/build.gradle.
 *
 * Run via: npm run bump-version -w packages/mobile
 * (uses tsx to execute directly without compilation)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setVersionName, incrementVersionCode } from './bump-version-pure.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolve paths relative to this script file
const rootPackageJsonPath = resolve(__dirname, '../../../package.json')
const buildGradlePath = resolve(__dirname, '../android/app/build.gradle')

// Read root package.json to get the canonical version
const rootPkg = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8')) as { version: string }
const version = rootPkg.version

// Read current build.gradle
let gradleText = readFileSync(buildGradlePath, 'utf-8')

// Apply transforms
gradleText = setVersionName(gradleText, version)
gradleText = incrementVersionCode(gradleText)

// Write back
writeFileSync(buildGradlePath, gradleText, 'utf-8')

// Extract new versionCode for logging
const codeMatch = gradleText.match(/\bversionCode\s+(\d+)/)
const newVersionCode = codeMatch ? codeMatch[1] : '(unknown)'

console.log(`versionName → "${version}"`)
console.log(`versionCode → ${newVersionCode}`)
