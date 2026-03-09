/*
  Azure Storage Account module — blob storage for profile pictures
  Creates a Storage Account with a public 'uploads' container and assigns
  the Storage Blob Data Contributor role to the specified principal.
*/

@description('Name for the Storage Account (must be globally unique, 3-24 lowercase alphanumeric).')
param name string

@description('Azure region.')
param location string

@description('Principal ID to grant Storage Blob Data Contributor role (e.g. API managed identity).')
param principalId string

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowBlobPublicAccess: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource uploadsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'uploads'
  properties: {
    publicAccess: 'Blob'
  }
}

// Storage Blob Data Contributor — ba92f5b4-2d11-453d-a403-e96b0029c9fe
resource storageBlobDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccount.id, principalId, 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

output name string = storageAccount.name
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob
