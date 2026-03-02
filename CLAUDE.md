# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**buddyburn** is an app that motivates buddies to burn calories. It is in early-stage development — no application source code exists yet.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 24 (via devcontainer base image `mcr.microsoft.com/devcontainers/typescript-node:4-24-trixie`)

The devcontainer hints at `yarn` as the package manager (commented-out `postCreateCommand: "yarn install"`).

## Development Environment

This project uses a Dev Container. Open in VS Code with the Remote - Containers extension or GitHub Codespaces to get the preconfigured environment with Node.js, TypeScript, GitHub CLI, and Claude Code.

## Commands

No build, lint, or test scripts exist yet. Once a `package.json` is created, update this file with the relevant commands.
