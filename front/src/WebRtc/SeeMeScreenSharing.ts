import {mediaManager} from "./MediaManager";

/**
 * A peer connection used to transmit video / audio signals between 2 peers.
 */
export class SeeMeScreenSharing {
    /**
     * Whether this connection is currently receiving a video stream from a remote user.
     */
    private isReceivingStream: boolean = false;
    public toClose: boolean = false;
    public _connected: boolean = false;

    constructor() {
    }

    streamFromTrack(track: MediaStreamTrack) {
        mediaManager.removeActiveScreenSharingVideo("0" );

        if (!track) {
            this.isReceivingStream = false;
        } else {
            const remoteStream = new MediaStream;
            remoteStream.addTrack(track);
            mediaManager.addStreamRemoteScreenSharing("0" , remoteStream);
            this.isReceivingStream = true;
        }
    }


    public isReceivingScreenSharingStream(): boolean {
        return this.isReceivingStream;
    }

    public destroy(error?: Error): void {
        try {
            mediaManager.removeActiveScreenSharingVideo("0");
            // FIXME: I don't understand why "Closing connection with" message is displayed TWICE before "Nb users in peerConnectionArray"
            // I do understand the method closeConnection is called twice, but I don't understand how they manage to run in parallel.
            //console.log('Closing connection with '+userId);
            //console.log('Nb users in peerConnectionArray '+this.PeerConnectionArray.size);
        } catch (err) {
            console.error("ScreenSharingPeer::destroy", err)
        }
    }
}
