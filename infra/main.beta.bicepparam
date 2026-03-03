/*
  Beta parameter file for buddyburn infrastructure.
  Deploy to resource group: buddyburn-beta

  az deployment group create \
    --resource-group buddyburn-beta \
    --template-file infra/main.bicep \
    --parameters infra/main.beta.bicepparam

  Dry run:
    az deployment group create \
      --resource-group buddyburn-beta \
      --template-file infra/main.bicep \
      --parameters infra/main.beta.bicepparam \
      --what-if
*/
using './main.bicep'

param environment = 'beta'
param containerRegistryServer = 'burnbuddyacr.azurecr.io'
param imageTag = 'latest'
param keyVaultName = 'buddyburn-beta-kv'
param keyVaultResourceGroup = 'buddyburn-beta'
