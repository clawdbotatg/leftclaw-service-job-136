// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title VaultIDV2
/// @notice Soulbound ERC-721 (ERC-5192) representing on-chain Vault IDs.
/// @dev All transfers / approvals revert. Tokens are paid for in CLAWD or CV ERC-20 tokens.
contract VaultIDV2 is ERC721, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Structs
    // ---------------------------------------------------------------------

    struct Vault {
        address holder;
        address backupWallet; // address(0) if none
        string encryptedContentURI; // <= 256 chars
        string title; // <= 64
        uint8 category; // 0..8
        string icon; // <= 8 bytes
        string publicDescription; // <= 256
        uint64 mintedAt;
        uint64 expiresAt; // 0 = permanent
        bool burned; // soft-burn
    }

    struct MintParams {
        address backupWallet;
        string encryptedContentURI;
        string title;
        uint8 category;
        string icon;
        string publicDescription;
        uint64 expiresAt;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint256 public constant CLAWD_COST = 100_000 * 1e18;
    uint256 public constant CV_COST = 1_000_000 * 1e18;
    uint256 public constant MAX_EXTENSION = 365 days;

    /// @notice ERC-5192 interface id (Locked)
    bytes4 private constant _INTERFACE_ID_ERC5192 = 0xb45a3c0e;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(uint256 => Vault) public vaults;
    mapping(address => uint256) private _activeBalances;

    /// @notice CLAWD token on Base
    address public immutable clawdToken = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
    /// @notice CV token (set post-deploy by the owner)
    address public cvToken;
    /// @notice Recipient of mint fees
    address public feeRecipient;

    uint256 private _nextTokenId = 1;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event VaultMinted(uint256 indexed tokenId, address indexed holder, uint8 category, address backupWallet);
    event VaultBurned(uint256 indexed tokenId, address indexed by);
    event BackupWalletChanged(uint256 indexed tokenId, address indexed oldBackup, address indexed newBackup);
    event ExpiryExtended(uint256 indexed tokenId, uint64 newExpiresAt);
    event Locked(uint256 indexed tokenId); // ERC-5192

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error Unauthorized();
    error SoulboundLocked();
    error BackupEqualsHolder();
    error InvalidCategory();
    error URITooLong();
    error TitleTooLong();
    error IconTooLong();
    error DescriptionTooLong();
    error CvTokenNotSet();
    error ZeroAddress();
    error SelfRecipient();
    error AlreadyPermanent();
    error ExtensionTooLong();
    error VaultAlreadyBurned();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address _feeRecipient) ERC721("VaultID", "VAULT") Ownable(msg.sender) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(this)) revert SelfRecipient();
        feeRecipient = _feeRecipient;
    }

    // ---------------------------------------------------------------------
    // Mint
    // ---------------------------------------------------------------------

    function mintWithCLAWD(MintParams calldata params) external nonReentrant {
        IERC20(clawdToken).safeTransferFrom(msg.sender, feeRecipient, CLAWD_COST);
        _mintVault(params);
    }

    function mintWithCV(MintParams calldata params) external nonReentrant {
        if (cvToken == address(0)) revert CvTokenNotSet();
        IERC20(cvToken).safeTransferFrom(msg.sender, feeRecipient, CV_COST);
        _mintVault(params);
    }

    // ---------------------------------------------------------------------
    // Vault management
    // ---------------------------------------------------------------------

    function burn(uint256 tokenId) external {
        _requireOwned(tokenId);
        Vault storage v = vaults[tokenId];
        if (msg.sender != v.holder && msg.sender != v.backupWallet) revert Unauthorized();
        if (v.burned) revert VaultAlreadyBurned();
        v.burned = true;
        unchecked {
            _activeBalances[v.holder] -= 1;
        }
        emit VaultBurned(tokenId, msg.sender);
    }

    function extendExpiry(uint256 tokenId, uint64 additionalSeconds) external {
        _requireOwned(tokenId);
        Vault storage v = vaults[tokenId];
        if (v.burned) revert VaultAlreadyBurned();
        if (v.expiresAt == 0) revert AlreadyPermanent();
        if (msg.sender != v.holder && msg.sender != v.backupWallet) revert Unauthorized();
        if (additionalSeconds > MAX_EXTENSION) revert ExtensionTooLong();
        v.expiresAt += additionalSeconds;
        emit ExpiryExtended(tokenId, v.expiresAt);
    }


    function setBackupWallet(uint256 tokenId, address newBackup) external {
        _requireOwned(tokenId);
        Vault storage v = vaults[tokenId];
        if (v.burned) revert VaultAlreadyBurned();
        if (msg.sender != v.holder) revert Unauthorized();
        if (newBackup != address(0) && newBackup == v.holder) revert BackupEqualsHolder();
        address oldBackup = v.backupWallet;
        v.backupWallet = newBackup;
        emit BackupWalletChanged(tokenId, oldBackup, newBackup);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setCvToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        cvToken = token;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        if (recipient == address(this)) revert SelfRecipient();
        feeRecipient = recipient;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function activeBalanceOf(address user) external view returns (uint256) {
        return _activeBalances[user];
    }

    /// @notice ERC-5192: every token is permanently locked.
    function locked(uint256 /*tokenId*/ ) external pure returns (bool) {
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == _INTERFACE_ID_ERC5192 || super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------------
    // Soulbound: block all transfers / approvals
    // ---------------------------------------------------------------------

    function transferFrom(address, address, uint256) public pure override {
        revert SoulboundLocked();
    }

    /// @dev OZ's 3-arg safeTransferFrom is non-virtual and forwards to the
    /// 4-arg overload, which reverts via the override below. This ensures
    /// every transfer entrypoint is blocked for soulbound tokens.
    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert SoulboundLocked();
    }

    function approve(address, uint256) public pure override {
        revert SoulboundLocked();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundLocked();
    }

    // ---------------------------------------------------------------------
    // Token URI
    // ---------------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Vault memory v = vaults[tokenId];

        string memory status;
        if (v.burned) {
            status = "Deleted";
        } else if (v.expiresAt > 0 && block.timestamp > v.expiresAt) {
            status = "Expired";
        } else {
            status = "Active";
        }

        string memory svg = _buildSVG(v);
        string memory imageField =
            string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));

        bytes memory json = abi.encodePacked(
            '{"name":"Vault #',
            Strings.toString(tokenId),
            '","description":"',
            _jsonEscape(v.publicDescription),
            '","vaultIdMetadataVersion":"2.0","category":',
            Strings.toString(uint256(v.category)),
            ',"icon":"',
            _jsonEscape(v.icon),
            '","title":"',
            _jsonEscape(v.title),
            '","status":"',
            status,
            '","image":"',
            imageField,
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    // ---------------------------------------------------------------------
    // Internal mint logic
    // ---------------------------------------------------------------------

    function _mintVault(MintParams calldata params) internal {
        if (params.category > 8) revert InvalidCategory();
        if (bytes(params.encryptedContentURI).length > 256) revert URITooLong();
        if (bytes(params.title).length > 64) revert TitleTooLong();
        if (bytes(params.icon).length > 8) revert IconTooLong();
        if (bytes(params.publicDescription).length > 256) revert DescriptionTooLong();
        if (params.backupWallet != address(0) && params.backupWallet == msg.sender) {
            revert BackupEqualsHolder();
        }

        uint256 tokenId = _nextTokenId++;

        vaults[tokenId] = Vault({
            holder: msg.sender,
            backupWallet: params.backupWallet,
            encryptedContentURI: params.encryptedContentURI,
            title: params.title,
            category: params.category,
            icon: params.icon,
            publicDescription: params.publicDescription,
            mintedAt: uint64(block.timestamp),
            expiresAt: params.expiresAt,
            burned: false
        });

        unchecked {
            _activeBalances[msg.sender] += 1;
        }

        // Use _mint (not _safeMint) to remove the onERC721Received reentrancy
        // surface; tokens are soulbound so the safe-mint receiver hook is
        // unnecessary. State is written before _mint to follow CEI ordering.
        _mint(msg.sender, tokenId);

        emit VaultMinted(tokenId, msg.sender, params.category, params.backupWallet);
        emit Locked(tokenId);
    }

    // ---------------------------------------------------------------------
    // SVG / escaping helpers
    // ---------------------------------------------------------------------

    function _buildSVG(Vault memory v) internal pure returns (string memory) {
        string memory color = _categoryColor(v.category);
        string memory safeIcon = _xmlEscape(v.icon);
        string memory safeTitle = _xmlEscape(v.title);
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
            '<rect width="350" height="350" fill="',
            color,
            '"/>',
            '<text x="175" y="170" font-family="sans-serif" font-size="120" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF">',
            safeIcon,
            "</text>",
            '<text x="175" y="280" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#FFFFFF">',
            safeTitle,
            "</text>",
            "</svg>"
        );
    }

    function _categoryColor(uint8 cat) internal pure returns (string memory) {
        if (cat == 0) return "#F59E0B"; // Pass
        if (cat == 1) return "#64748B"; // Receipt
        if (cat == 2) return "#F43F5E"; // Memory
        if (cat == 3) return "#6366F1"; // Membership
        if (cat == 4) return "#10B981"; // Medical
        if (cat == 5) return "#B45309"; // Warranty
        if (cat == 6) return "#0EA5E9"; // Identity
        if (cat == 7) return "#8B5CF6"; // Crypto
        return "#6B7280"; // Other
    }

    /// @dev Escapes characters that are unsafe inside a JSON string literal.
    function _jsonEscape(string memory s) internal pure returns (string memory) {
        bytes memory input = bytes(s);
        // Worst-case factor 6 (control chars become \u00XX).
        bytes memory out = new bytes(input.length * 6);
        uint256 j = 0;
        for (uint256 i = 0; i < input.length; i++) {
            bytes1 c = input[i];
            if (c == 0x5c) {
                // \
                out[j++] = 0x5c;
                out[j++] = 0x5c;
            } else if (c == 0x22) {
                // "
                out[j++] = 0x5c;
                out[j++] = 0x22;
            } else if (c == 0x0a) {
                // \n
                out[j++] = 0x5c;
                out[j++] = "n";
            } else if (c == 0x0d) {
                // \r
                out[j++] = 0x5c;
                out[j++] = "r";
            } else if (c == 0x09) {
                // \t
                out[j++] = 0x5c;
                out[j++] = "t";
            } else if (c == 0x08) {
                // \b
                out[j++] = 0x5c;
                out[j++] = "b";
            } else if (c == 0x0c) {
                // \f
                out[j++] = 0x5c;
                out[j++] = "f";
            } else if (uint8(c) < 0x20) {
                // \u00XX
                out[j++] = 0x5c;
                out[j++] = "u";
                out[j++] = "0";
                out[j++] = "0";
                out[j++] = _hexNibble(uint8(c) >> 4);
                out[j++] = _hexNibble(uint8(c) & 0x0f);
            } else {
                out[j++] = c;
            }
        }
        // Trim
        bytes memory trimmed = new bytes(j);
        for (uint256 k = 0; k < j; k++) {
            trimmed[k] = out[k];
        }
        return string(trimmed);
    }

    /// @dev Escapes characters that are unsafe inside XML/SVG text content / attribute values.
    function _xmlEscape(string memory s) internal pure returns (string memory) {
        bytes memory input = bytes(s);
        // Worst case: each char becomes "&quot;" (6 bytes) etc. Use 6.
        bytes memory out = new bytes(input.length * 6);
        uint256 j = 0;
        for (uint256 i = 0; i < input.length; i++) {
            bytes1 c = input[i];
            if (c == 0x26) {
                // &
                out[j++] = "&";
                out[j++] = "a";
                out[j++] = "m";
                out[j++] = "p";
                out[j++] = ";";
            } else if (c == 0x3c) {
                // <
                out[j++] = "&";
                out[j++] = "l";
                out[j++] = "t";
                out[j++] = ";";
            } else if (c == 0x3e) {
                // >
                out[j++] = "&";
                out[j++] = "g";
                out[j++] = "t";
                out[j++] = ";";
            } else if (c == 0x22) {
                // "
                out[j++] = "&";
                out[j++] = "q";
                out[j++] = "u";
                out[j++] = "o";
                out[j++] = "t";
                out[j++] = ";";
            } else if (c == 0x27) {
                // '
                out[j++] = "&";
                out[j++] = "#";
                out[j++] = "3";
                out[j++] = "9";
                out[j++] = ";";
            } else {
                out[j++] = c;
            }
        }
        bytes memory trimmed = new bytes(j);
        for (uint256 k = 0; k < j; k++) {
            trimmed[k] = out[k];
        }
        return string(trimmed);
    }

    function _hexNibble(uint8 n) private pure returns (bytes1) {
        if (n < 10) return bytes1(uint8(0x30) + n); // '0'..'9'
        return bytes1(uint8(0x61) + (n - 10)); // 'a'..'f'
    }
}
