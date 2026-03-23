# Network Module
# Creates subnets and NSGs in an existing VNet for private endpoints and APIM.
# Uses azapi_resource for subnet creation (Landing Zone requires NSG at creation time).

# -----------------------------------------------------------------------------
# Data source: existing VNet
# -----------------------------------------------------------------------------
data "azurerm_virtual_network" "this" {
  name                = var.vnet_name
  resource_group_name = var.vnet_resource_group
}

# -----------------------------------------------------------------------------
# Private Endpoint Subnet + NSG
# -----------------------------------------------------------------------------
resource "azurerm_network_security_group" "pe" {
  name                = "${var.name_prefix}-pe-nsg"
  location            = var.location
  resource_group_name = var.vnet_resource_group

  # Inbound: allow VNet address spaces to reach PE subnet
  dynamic "security_rule" {
    for_each = data.azurerm_virtual_network.this.address_space
    content {
      name                       = "AllowInboundFromVNet-${replace(replace(security_rule.value, ".", "-"), "/", "-")}"
      priority                   = 100 + index(data.azurerm_virtual_network.this.address_space, security_rule.value)
      direction                  = "Inbound"
      access                     = "Allow"
      protocol                   = "*"
      source_address_prefix      = security_rule.value
      destination_address_prefix = var.pe_subnet_cidr
      source_port_range          = "*"
      destination_port_range     = "*"
    }
  }

  # Outbound: PE subnet to VNet address spaces
  dynamic "security_rule" {
    for_each = data.azurerm_virtual_network.this.address_space
    content {
      name                       = "AllowOutboundToVNet-${replace(replace(security_rule.value, ".", "-"), "/", "-")}"
      priority                   = 200 + index(data.azurerm_virtual_network.this.address_space, security_rule.value)
      direction                  = "Outbound"
      access                     = "Allow"
      protocol                   = "*"
      source_address_prefix      = var.pe_subnet_cidr
      destination_address_prefix = security_rule.value
      source_port_range          = "*"
      destination_port_range     = "*"
    }
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# Source/tools VNet NSG rules (only when source_vnet_address_space is provided)
resource "azurerm_network_security_rule" "pe_inbound_source_vnet" {
  count = var.source_vnet_address_space != "" ? 1 : 0

  name                        = "AllowInboundFromSourceVNet"
  priority                    = 300
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "*"
  source_address_prefix       = var.source_vnet_address_space
  destination_address_prefix  = var.pe_subnet_cidr
  source_port_range           = "*"
  destination_port_range      = "*"
  resource_group_name         = var.vnet_resource_group
  network_security_group_name = azurerm_network_security_group.pe.name
}

resource "azurerm_network_security_rule" "pe_outbound_source_vnet" {
  count = var.source_vnet_address_space != "" ? 1 : 0

  name                        = "AllowOutboundToSourceVNet"
  priority                    = 301
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "*"
  source_address_prefix       = var.pe_subnet_cidr
  destination_address_prefix  = var.source_vnet_address_space
  source_port_range           = "*"
  destination_port_range      = "*"
  resource_group_name         = var.vnet_resource_group
  network_security_group_name = azurerm_network_security_group.pe.name
}

# PE subnet via azapi (Landing Zone requires NSG association at creation time)
resource "azapi_resource" "pe_subnet" {
  type      = "Microsoft.Network/virtualNetworks/subnets@2023-04-01"
  name      = "${var.name_prefix}-pe-subnet"
  parent_id = data.azurerm_virtual_network.this.id
  locks     = [data.azurerm_virtual_network.this.id]

  body = {
    properties = {
      addressPrefix = var.pe_subnet_cidr

      networkSecurityGroup = {
        id = azurerm_network_security_group.pe.id
      }

      privateEndpointNetworkPolicies = "Disabled"
    }
  }

  response_export_values = ["*"]
}

# -----------------------------------------------------------------------------
# APIM Subnet + NSG
# For classic Developer tier VNet injection (not stv2 delegation)
# -----------------------------------------------------------------------------
resource "azurerm_network_security_group" "apim" {
  name                = "${var.name_prefix}-apim-nsg"
  location            = var.location
  resource_group_name = var.vnet_resource_group

  # Inbound: APIM management plane
  security_rule {
    name                       = "AllowApiManagement"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "3443"
    source_address_prefix      = "ApiManagement"
    destination_address_prefix = "VirtualNetwork"
  }

  # Inbound: Azure Load Balancer health probes
  security_rule {
    name                       = "AllowAzureLoadBalancer"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "AzureLoadBalancer"
    destination_address_prefix = "VirtualNetwork"
  }

  # Inbound: HTTPS from Internet (for external APIM gateway access)
  security_rule {
    name                       = "AllowHttpsInbound"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "Internet"
    destination_address_prefix = "VirtualNetwork"
  }

  # Outbound: Azure Storage (APIM config, logs)
  security_rule {
    name                       = "AllowStorageOutbound"
    priority                   = 100
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Storage"
  }

  # Outbound: Azure Key Vault
  security_rule {
    name                       = "AllowKeyVaultOutbound"
    priority                   = 110
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "AzureKeyVault"
  }

  # Outbound: VNet to VNet (reach PE-backed services)
  security_rule {
    name                       = "AllowVirtualNetworkOutbound"
    priority                   = 120
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }

  # Outbound: Azure AD (managed identity tokens)
  security_rule {
    name                       = "AllowAzureADOutbound"
    priority                   = 130
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "AzureActiveDirectory"
  }

  # Outbound: Internet (external OAuth, developer portal)
  security_rule {
    name                       = "AllowInternetOutbound"
    priority                   = 140
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Internet"
  }

  # Outbound: SQL (required for classic APIM tiers)
  security_rule {
    name                       = "AllowSqlOutbound"
    priority                   = 150
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "1433"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Sql"
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# APIM subnet (classic Developer tier uses VNet injection, not delegation)
resource "azapi_resource" "apim_subnet" {
  type      = "Microsoft.Network/virtualNetworks/subnets@2023-04-01"
  name      = "${var.name_prefix}-apim-subnet"
  parent_id = data.azurerm_virtual_network.this.id
  locks     = [data.azurerm_virtual_network.this.id]

  body = {
    properties = {
      addressPrefix = var.apim_subnet_cidr

      networkSecurityGroup = {
        id = azurerm_network_security_group.apim.id
      }
    }
  }

  response_export_values = ["*"]

  depends_on = [azapi_resource.pe_subnet]
}
