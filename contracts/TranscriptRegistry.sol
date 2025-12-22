// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TranscriptRegistry {
    struct Transcript {
        string cid;
        string regNo;
        uint256 timestamp;
    }

    mapping(string => Transcript) private transcripts; // key: regNo

    event TranscriptStored(string indexed regNo, string cid, uint256 timestamp);

    function storeTranscript(string calldata regNo, string calldata cid) external {
        transcripts[regNo] = Transcript(cid, regNo, block.timestamp);
        emit TranscriptStored(regNo, cid, block.timestamp);
    }

    function getTranscript(string calldata regNo)
        external
        view
        returns (string memory cid, uint256 timestamp)
    {
        Transcript memory t = transcripts[regNo];
        return (t.cid, t.timestamp);
    }
}
