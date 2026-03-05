/*
  API Container App module — services/api
  Uses a system-assigned managed identity to pull secrets from Azure Key Vault.
  The managed identity must be granted the "Key Vault Secrets User" role on the Key Vault
  after initial deployment (or via a separate RBAC assignment step in CI/CD).
*/

@description('Name for the Container App resource.')
param name string

@description('Azure region.')
param location string

@description('Resource ID of the Container Apps Environment.')
param containerAppsEnvironmentId string

@description('Container Registry login server.')
param containerRegistryServer string

@description('Image tag to deploy.')
param imageTag string

@description('Resource ID of the existing Key Vault.')
param keyVaultId string

// Derive Key Vault base URI from resource ID using environment() for cross-cloud compatibility
var keyVaultUri = 'https://${last(split(keyVaultId, '/'))}.${environment().suffixes.keyvaultDns}'

resource apiApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: name
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
      }
      registries: [
        {
          server: containerRegistryServer
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'firebase-service-account-json'
          keyVaultUrl: '${keyVaultUri}/secrets/firebase-service-account-json'
          identity: 'system'
        }
        {
          name: 'firebase-web-project-id'
          keyVaultUrl: '${keyVaultUri}/secrets/firebase-web-project-id'
          identity: 'system'
        }
        {
          name: 'otel-collector-endpoint'
          keyVaultUrl: '${keyVaultUri}/secrets/otel-collector-endpoint'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${containerRegistryServer}/burnbuddy-api:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3001'
            }
            {
              name: 'FIREBASE_PROJECT_ID'
              secretRef: 'firebase-web-project-id'
            }
            {
              name: 'FIREBASE_SERVICE_ACCOUNT_JSON'
              secretRef: 'firebase-service-account-json'
            }
            {
              name: 'OTEL_EXPORTER_OTLP_ENDPOINT'
              secretRef: 'otel-collector-endpoint'
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        cooldownPeriod: 3600
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output id string = apiApp.id
output fqdn string = apiApp.properties.configuration.ingress.fqdn!
output principalId string = apiApp.identity.principalId!
