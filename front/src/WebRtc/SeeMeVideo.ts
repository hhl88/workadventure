import {mediaManager} from "./MediaManager";
import {blackListManager} from "./BlackListManager";
import type {Subscription} from "rxjs";
import type {UserSimplePeerInterface} from "./SimplePeer";



/**
 * A peer connection used to transmit video / audio signals between 2 peers.
 */
export class SeeMeVideo {
    public toClose: boolean = false;
    public _connected: boolean = false;
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
    public destroy(error?: Error): void {
        try {
            this._connected = false
            if (!this.toClose) {
                return;
            }
            // this.onBlockSubscribe.unsubscribe();
            // this.onUnBlockSubscribe.unsubscribe();
            mediaManager.removeActiveVideo("" + this.userId);
            // FIXME: I don't understand why "Closing connection with" message is displayed TWICE before "Nb users in peerConnectionArray"
            // I do understand the method closeConnection is called twice, but I don't understand how they manage to run in parallel.
            // super.destroy(error);
        } catch (err) {
            console.error("VideoPeer::destroy", err)
        }
    }


}
