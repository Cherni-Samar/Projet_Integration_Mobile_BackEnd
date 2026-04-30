# Centralized Energy Service

## Overview

The `CentralizedEnergyService` provides secure wrappers around energy consumption to ensure proper agent ownership validation in all scenarios. This service prevents energy theft by enforcing strict security rules.

## Security Rules

1. **User-initiated actions** MUST validate userId + agent ownership
2. **Autonomous actions** MUST find users who own the agent
3. **NO energy consumption** without proper ownership validation
4. **Clear blocking responses** when access is denied

## Methods

### `consumeForUser({ userId, agentName, taskType, taskDescription, metadata })`
- **Purpose**: Consume energy for user-initiated actions
- **Security**: Validates user owns the agent before consuming energy
- **Returns**: Energy consumption result with security validation

### `consumeForAutonomous({ agentName, taskType, taskDescription, metadata })`
- **Purpose**: Consume energy for autonomous operations (cron jobs, background tasks)
- **Security**: Finds users who own the agent AND have energy before consuming
- **Returns**: Energy consumption result with security validation

### `canUserUseAgent(userId, agentName)`
- **Purpose**: Check if a user can use a specific agent (validation only)
- **Security**: Wrapper around existing canUseAgent function
- **Returns**: Ownership validation result

### `findUsersWithAgentAndEnergy(agentName)`
- **Purpose**: Find users who own a specific agent and have energy
- **Security**: Wrapper around existing findUserWithAgentAndEnergy function
- **Returns**: User search result with ownership and energy validation

### `getSecurityInfo()`
- **Purpose**: Get security validation statistics
- **Returns**: Security statistics and validation info

## Usage Examples

```javascript
const CentralizedEnergyService = require('./services/energy/centralizedEnergy.service');

// User-initiated action
const result = await CentralizedEnergyService.consumeForUser({
  userId: 'user123',
  agentName: 'echo',
  taskType: 'CONTENT_GENERATION',
  taskDescription: 'Generate social media post',
  metadata: { platform: 'linkedin' }
});

// Autonomous operation
const result = await CentralizedEnergyService.consumeForAutonomous({
  agentName: 'echo',
  taskType: 'SOCIAL_POST',
  taskDescription: 'Scheduled social media post',
  metadata: { scheduled: true }
});
```

## Security Features

- ✅ Mandatory agent ownership validation
- ✅ User-initiated action protection
- ✅ Autonomous operation security
- ✅ Energy theft prevention
- ✅ Clear blocking responses
- ✅ Backward compatibility

## Dependencies

- `middleware/energyMiddleware.manualEnergyConsumption`
- `utils/agentGuard.canUseAgent`
- `utils/agentGuard.findUserWithAgentAndEnergy`

## Supported Agents

- echo
- hera
- dexo
- kash
- timo