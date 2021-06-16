import {mediaManager} from "./MediaManager";

/**
 * A peer connection used to transmit video / audio signals between 2 peers.
 */
export class SeeMeScreenSharing {
    /**
     * Whether this connection is currently receiving a video stream from a remote user.
     */
    private isReceivingStream: boolean = false;
    private readonly userId: number;
    private currentStreamUserId: number | undefined = undefined;

    constructor(userId: number) {
        this.userId = userId;
    }

    streamFromTrack(userId: number, track: MediaStreamTrack) {
        mediaManager.removeActiveScreenSharingVideo("" + userId);
        this.currentStreamUserId = userId;
        if (!track) {
            this.isReceivingStream = false;
        } else {
            const remoteStream = new MediaStream;
            remoteStream.addTrack(track);
            mediaManager.addStreamRemoteScreenSharing("" + userId, remoteStream);
            this.isReceivingStream = true;
        }
    }


    public isReceivingScreenSharingStream(): boolean {
        return this.isReceivingStream;
    }

    public destroy(userId?: number, error?: Error): boolean {
        if (!userId) {
            return false;
        }
        if (!mediaManager.checkActiveVideoExist("" +userId)) {
            return false;
        }

        try {
            mediaManager.removeActiveScreenSharingVideo("" + userId);
            this.isReceivingStream = false;
            // FIXME: I don't understand why "Closing connection with" message is displayed TWICE before "Nb users in peerConnectionArray"
            // I do understand the method closeConnection is called twice, but I don't understand how they manage to run in parallel.
            //console.log('Closing connection with '+userId);
            //console.log('Nb users in peerConnectionArray '+this.PeerConnectionArray.size);
            return true;
        } catch (err) {
            console.error("ScreenSharingPeer::destroy", err)
            return false;
        }
    }

    public destroyCurrent(error?: Error): boolean {
        const flag = this.destroy(this.currentStreamUserId, error);
        this.currentStreamUserId = undefined;
        return flag;
    }

    public destroyMySelf(error?: Error): boolean {
        return this.destroy(this.userId, error);
    }
}
