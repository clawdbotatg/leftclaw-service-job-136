// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import { VaultIDV2 } from "../contracts/VaultIDV2.sol";

/// @dev Minimal mintable ERC-20 mock used to fund test users.
contract MockERC20 {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            allowance[from][msg.sender] = a - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract VaultIDV2Test is Test {
    VaultIDV2 internal vault;
    MockERC20 internal clawd;

    address internal feeRecipient = address(0xFEE);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    address internal constant CLAWD_ADDR = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    function setUp() public {
        // Deploy a mock ERC-20 and place its bytecode at the hard-coded CLAWD address
        // so the contract uses our mock for SafeERC20 calls.
        clawd = new MockERC20();
        vm.etch(CLAWD_ADDR, address(clawd).code);

        vault = new VaultIDV2(feeRecipient);

        // Fund Alice with CLAWD via the on-chain mock (operating on the etched address).
        MockERC20(CLAWD_ADDR).mint(alice, vault.CLAWD_COST() * 10);
    }

    function _defaultParams() internal pure returns (VaultIDV2.MintParams memory p) {
        p = VaultIDV2.MintParams({
            backupWallet: address(0),
            encryptedContentURI: "ipfs://encrypted",
            title: "My Vault",
            category: 0,
            icon: unicode"🔐",
            publicDescription: "Test vault",
            expiresAt: 0
        });
    }

    function testMintWithCLAWD() public {
        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(_defaultParams());
        vm.stopPrank();

        (address holder,,,, uint8 category,,,,,) = vault.vaults(1);
        assertEq(holder, alice);
        assertEq(category, 0);
        assertEq(vault.ownerOf(1), alice);
        assertEq(vault.activeBalanceOf(alice), 1);
        // Fee recipient should have received the CLAWD.
        assertEq(MockERC20(CLAWD_ADDR).balanceOf(feeRecipient), vault.CLAWD_COST());
    }

    function testSoulbound() public {
        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(_defaultParams());

        vm.expectRevert(VaultIDV2.SoulboundLocked.selector);
        vault.transferFrom(alice, bob, 1);

        vm.expectRevert(VaultIDV2.SoulboundLocked.selector);
        vault.safeTransferFrom(alice, bob, 1);

        vm.expectRevert(VaultIDV2.SoulboundLocked.selector);
        vault.approve(bob, 1);

        vm.expectRevert(VaultIDV2.SoulboundLocked.selector);
        vault.setApprovalForAll(bob, true);
        vm.stopPrank();

        assertTrue(vault.locked(1));
    }

    function testBurn() public {
        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(_defaultParams());

        vault.burn(1);
        vm.stopPrank();

        (,,,,,,,,, bool burned) = vault.vaults(1);
        assertTrue(burned);
        assertEq(vault.activeBalanceOf(alice), 0);

        // Re-burn should revert.
        vm.prank(alice);
        vm.expectRevert(VaultIDV2.VaultAlreadyBurned.selector);
        vault.burn(1);
    }

    function testExtendExpiry() public {
        VaultIDV2.MintParams memory p = _defaultParams();
        p.expiresAt = uint64(block.timestamp + 30 days);

        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(p);

        uint64 before;
        (,,,,,,,, before,) = vault.vaults(1);
        vault.extendExpiry(1, 7 days);
        uint64 afterTs;
        (,,,,,,,, afterTs,) = vault.vaults(1);
        assertEq(afterTs, before + 7 days);

        // Too long
        uint64 tooLong = uint64(vault.MAX_EXTENSION()) + 1;
        vm.expectRevert(VaultIDV2.ExtensionTooLong.selector);
        vault.extendExpiry(1, tooLong);
        vm.stopPrank();

        // Permanent vault: mint another and try to extend.
        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(_defaultParams()); // expiresAt = 0
        vm.expectRevert(VaultIDV2.AlreadyPermanent.selector);
        vault.extendExpiry(2, 1 days);
        vm.stopPrank();
    }

    function testExtendExpiryRevertsWhenBurned() public {
        VaultIDV2.MintParams memory p = _defaultParams();
        p.expiresAt = uint64(block.timestamp + 30 days);

        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(p);
        vault.burn(1);

        vm.expectRevert(VaultIDV2.VaultAlreadyBurned.selector);
        vault.extendExpiry(1, 1 days);
        vm.stopPrank();
    }

    function testSetBackupWalletRevertsWhenBurned() public {
        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(_defaultParams());
        vault.burn(1);

        vm.expectRevert(VaultIDV2.VaultAlreadyBurned.selector);
        vault.setBackupWallet(1, bob);
        vm.stopPrank();
    }

    function testExtendExpiryRevertsForNonexistentToken() public {
        vm.expectRevert();
        vault.extendExpiry(999, 1 days);
    }

    function testThreeArgSafeTransferFromReverts() public {
        vm.startPrank(alice);
        MockERC20(CLAWD_ADDR).approve(address(vault), vault.CLAWD_COST());
        vault.mintWithCLAWD(_defaultParams());

        vm.expectRevert(VaultIDV2.SoulboundLocked.selector);
        vault.safeTransferFrom(alice, bob, 1);
        vm.stopPrank();
    }
}
