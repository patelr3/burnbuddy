/*
  Web Container App module — apps/web (Next.js)
  Publicly accessible. Receives the API URL as an environment variable so
  Next.js server-side calls can reach the API Container App.
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

@description('Internal FQDN of the API Container App.')
param apiUrl string

resource webApp 'Microsoft.App/containerApps@2023-05-01' = {
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
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          server: containerRegistryServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${containerRegistryServer}/burnbuddy-web:${imageTag}'
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
              value: '3000'
            }
            {
              name: 'NEXT_PUBLIC_API_URL'
              value: apiUrl
            }
            {
              name: 'API_URL'
              value: apiUrl
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
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

output id string = webApp.id
output fqdn string = webApp.properties.configuration.ingress.fqdn!
output principalId string = webApp.identity.principalId!
