// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { VaultIDV2 } from "../contracts/VaultIDV2.sol";

/**
 * @notice Deploy script for VaultIDV2.
 * @dev Deploys with the deployer as the initial fee recipient, then
 *      initiates an Ownable2Step transfer to the client wallet. The client
 *      must call `acceptOwnership()` to complete the handover.
 *
 * Example:
 *   yarn deploy --file DeployVaultIDV2.s.sol --network base
 */
contract DeployVaultIDV2 is ScaffoldETHDeploy {
    /// @notice Final owner of the contract (Leftclaw client wallet).
    address constant CLIENT_OWNER = 0xFE968dE21eb0E77d5877477C31a04A3075c0086E;

    function run() external ScaffoldEthDeployerRunner {
        VaultIDV2 vaultId = new VaultIDV2(deployer);
        deployments.push(Deployment({ name: "VaultIDV2", addr: address(vaultId) }));

        // Hand off ownership (Ownable2Step: client must acceptOwnership()).
        vaultId.transferOwnership(CLIENT_OWNER);

        console.logString(string.concat("VaultIDV2 deployed at ", vm.toString(address(vaultId))));
        console.logString(string.concat("Pending ownership transfer to ", vm.toString(CLIENT_OWNER)));
    }
}
