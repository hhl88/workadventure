import {mediaManager} from "./MediaManager";
import type {UserSimplePeerInterface} from "./SimplePeer";


/**
 * A peer connection used to transmit video / audio signals between 2 peers.
 */
export class SeeMeVideo {
    private remoteStream!: MediaStream;
    private readonly userId: number;
    private readonly userName: string;

    constructor(public user: UserSimplePeerInterface) {
        this.userId = user.userId;
        this.userName = user.name || '';
    }

    streamFromTrack(track: MediaStreamTrack) {
        try {
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream;
            }
            this.remoteStream.addTrack(track);
            mediaManager.addStreamRemoteVideo("" + this.userId, this.remoteStream);
        } catch (err) {
            console.error(err);
        }
    }

    /**
     * This is triggered twice. Once by the server, and once by a remote client disconnecting
     */
    public destroy(): void {
        console.log('destroy', this.userId);
        mediaManager.removeActiveVideo("" + this.userId);
    }


}
