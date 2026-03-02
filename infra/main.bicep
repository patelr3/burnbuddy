/*
  buddyburn Azure Container Apps infrastructure
  Deploys to an existing resource group (buddyburn-prod or buddyburn-dev).
  The resource group must exist before running this template.
  Key Vault must already exist — this template references it, not creates it.

  Usage:
    az deployment group create \
      --resource-group buddyburn-prod \
      --template-file infra/main.bicep \
      --parameters infra/main.prod.bicepparam

  Dry run (what-if):
    az deployment group create \
      --resource-group buddyburn-prod \
      --template-file infra/main.bicep \
      --parameters infra/main.prod.bicepparam \
      --what-if
*/

@description('Environment name — used as a prefix for all resource names.')
@allowed(['dev', 'prod'])
param environment string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Azure Container Registry login server (e.g. burnbuddyacr.azurecr.io).')
param containerRegistryServer string

@description('Image tag to deploy for both apps.')
param imageTag string = 'latest'

@description('Name of the existing Azure Key Vault that holds app secrets.')
param keyVaultName string

@description('Resource group where the existing Key Vault lives (defaults to this resource group).')
param keyVaultResourceGroup string = resourceGroup().name

// ---------------------------------------------------------------------------
// Log Analytics Workspace (required by Container Apps Environment)
// ---------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'buddyburn-${environment}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ---------------------------------------------------------------------------
// Container Apps Environment
// ---------------------------------------------------------------------------

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'buddyburn-${environment}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reference to the existing Key Vault (must already exist)
// ---------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  scope: resourceGroup(keyVaultResourceGroup)
}

// ---------------------------------------------------------------------------
// API Container App (services/api)
// ---------------------------------------------------------------------------

module apiApp 'modules/api-container-app.bicep' = {
  name: 'api-container-app'
  params: {
    name: 'buddyburn-${environment}-api'
    location: location
    containerAppsEnvironmentId: containerAppsEnv.id
    containerRegistryServer: containerRegistryServer
    imageTag: imageTag
    keyVaultId: keyVault.id
  }
}

// ---------------------------------------------------------------------------
// Web Container App (apps/web — Next.js)
// ---------------------------------------------------------------------------

module webApp 'modules/web-container-app.bicep' = {
  name: 'web-container-app'
  params: {
    name: 'buddyburn-${environment}-web'
    location: location
    containerAppsEnvironmentId: containerAppsEnv.id
    containerRegistryServer: containerRegistryServer
    imageTag: imageTag
    apiUrl: 'https://${apiApp.outputs.fqdn}'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output apiUrl string = 'https://${apiApp.outputs.fqdn}'
output webUrl string = 'https://${webApp.outputs.fqdn}'
output containerAppsEnvironmentId string = containerAppsEnv.id
