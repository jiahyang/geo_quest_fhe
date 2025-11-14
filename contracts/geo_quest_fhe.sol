pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract GeoQuestFHE is ZamaEthereumConfig {
    struct LocationData {
        string locationId;
        euint32 encryptedLatitude;
        euint32 encryptedLongitude;
        uint256 publicRadius;
        string description;
        address creator;
        uint256 timestamp;
        bool isVerified;
        uint32 decryptedLatitude;
        uint32 decryptedLongitude;
    }

    mapping(string => LocationData) public locationData;
    string[] public locationIds;

    event LocationCreated(string indexed locationId, address indexed creator);
    event LocationVerified(string indexed locationId, uint32 decryptedLatitude, uint32 decryptedLongitude);

    constructor() ZamaEthereumConfig() {
    }

    function createLocation(
        string calldata locationId,
        externalEuint32 encryptedLatitude,
        externalEuint32 encryptedLongitude,
        bytes calldata latitudeProof,
        bytes calldata longitudeProof,
        uint256 publicRadius,
        string calldata description
    ) external {
        require(bytes(locationData[locationId].locationId).length == 0, "Location already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedLatitude, latitudeProof)), "Invalid encrypted latitude");
        require(FHE.isInitialized(FHE.fromExternal(encryptedLongitude, longitudeProof)), "Invalid encrypted longitude");

        locationData[locationId] = LocationData({
            locationId: locationId,
            encryptedLatitude: FHE.fromExternal(encryptedLatitude, latitudeProof),
            encryptedLongitude: FHE.fromExternal(encryptedLongitude, longitudeProof),
            publicRadius: publicRadius,
            description: description,
            creator: msg.sender,
            timestamp: block.timestamp,
            isVerified: false,
            decryptedLatitude: 0,
            decryptedLongitude: 0
        });

        FHE.allowThis(locationData[locationId].encryptedLatitude);
        FHE.allowThis(locationData[locationId].encryptedLongitude);
        FHE.makePubliclyDecryptable(locationData[locationId].encryptedLatitude);
        FHE.makePubliclyDecryptable(locationData[locationId].encryptedLongitude);

        locationIds.push(locationId);
        emit LocationCreated(locationId, msg.sender);
    }

    function verifyLocation(
        string calldata locationId,
        bytes memory abiEncodedClearLatitude,
        bytes memory abiEncodedClearLongitude,
        bytes memory latitudeProof,
        bytes memory longitudeProof
    ) external {
        require(bytes(locationData[locationId].locationId).length > 0, "Location does not exist");
        require(!locationData[locationId].isVerified, "Location already verified");

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(locationData[locationId].encryptedLatitude);
        cts[1] = FHE.toBytes32(locationData[locationId].encryptedLongitude);

        FHE.checkSignatures(cts, abiEncodedClearLatitude, latitudeProof);
        FHE.checkSignatures(cts, abiEncodedClearLongitude, longitudeProof);

        uint32 decodedLatitude = abi.decode(abiEncodedClearLatitude, (uint32));
        uint32 decodedLongitude = abi.decode(abiEncodedClearLongitude, (uint32));

        locationData[locationId].decryptedLatitude = decodedLatitude;
        locationData[locationId].decryptedLongitude = decodedLongitude;
        locationData[locationId].isVerified = true;

        emit LocationVerified(locationId, decodedLatitude, decodedLongitude);
    }

    function checkLocationProximity(
        string calldata locationId,
        externalEuint32 encryptedUserLatitude,
        externalEuint32 encryptedUserLongitude,
        bytes calldata latitudeProof,
        bytes calldata longitudeProof
    ) external view returns (bool) {
        require(bytes(locationData[locationId].locationId).length > 0, "Location does not exist");
        require(locationData[locationId].isVerified, "Location not verified");

        euint32 userLatitude = FHE.fromExternal(encryptedUserLatitude, latitudeProof);
        euint32 userLongitude = FHE.fromExternal(encryptedUserLongitude, longitudeProof);

        euint32 latitudeDiff = FHE.sub(userLatitude, locationData[locationId].encryptedLatitude);
        euint32 longitudeDiff = FHE.sub(userLongitude, locationData[locationId].encryptedLongitude);

        euint32 distanceSquared = FHE.add(
            FHE.mul(latitudeDiff, latitudeDiff),
            FHE.mul(longitudeDiff, longitudeDiff)
        );

        euint32 radiusSquared = FHE.euint32(locationData[locationId].publicRadius * locationData[locationId].publicRadius);

        return FHE.leq(distanceSquared, radiusSquared);
    }

    function getLocationData(string calldata locationId) external view returns (
        string memory description,
        address creator,
        uint256 timestamp,
        bool isVerified,
        uint256 publicRadius
    ) {
        require(bytes(locationData[locationId].locationId).length > 0, "Location does not exist");
        LocationData storage data = locationData[locationId];
        
        return (
            data.description,
            data.creator,
            data.timestamp,
            data.isVerified,
            data.publicRadius
        );
    }

    function getAllLocationIds() external view returns (string[] memory) {
        return locationIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}

