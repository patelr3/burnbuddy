# Copilot Instructions

This file provides guidance to Copilot Code when working with code in this repository.

## Project

**buddyburn** is an app that motivates buddies to burn calories. Monorepo with a Next.js web app, Express API, Expo mobile app, and shared types package.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 24 (via devcontainer base image `mcr.microsoft.com/devcontainers/typescript-node:4-24-trixie`)

The devcontainer hints at `yarn` as the package manager (commented-out `postCreateCommand: "yarn install"`).

## Development Environment

This project uses a Dev Container. Open in VS Code with the Remote - Containers extension or GitHub Codespaces to get the preconfigured environment with Node.js, TypeScript, GitHub CLI, and Copilot Code.

## Commands

- **Build all packages**: `yarn build`
- **Typecheck all packages**: `yarn typecheck`
- **Run API tests**: `cd services/api && yarn test`
- **Dev web app**: `yarn dev:web`
- **Dev API service**: `yarn dev:api`

## Secrets & Security

Store all secrets in Azure Key Vault (AKV). Avoid passwords and client secrets wherever possible; prefer managed identity and federated credentials.

- **Beta**: `buddyburn-beta-kv`
- **Production**: `buddyburn-prod-kv`

Firebase configuration values such as `firebase-api-key` and `firebase-auth-domain` can be retrieved from AKV as needed.
