import {mediaManager} from "./MediaManager";
import {blackListManager} from "./BlackListManager";
import {Subscription} from "rxjs";
import {UserSimplePeerInterface} from "./SimplePeer";

export const MESSAGE_TYPE_CONSTRAINT = 'constraint';
export const MESSAGE_TYPE_MESSAGE = 'message';
export const MESSAGE_TYPE_BLOCKED = 'blocked';
export const MESSAGE_TYPE_UNBLOCKED = 'unblocked';

/**
 * A peer connection used to transmit video / audio signals between 2 peers.
 */
export class SeeMeVideo {
    public toClose: boolean = false;
    public _connected: boolean = false;
    private remoteStream!: MediaStream;
    private blocked: boolean = false;
    private userId: number;
    private userName: string;
    private onBlockSubscribe: Subscription;
    private onUnBlockSubscribe: Subscription;

    constructor(public user: UserSimplePeerInterface) {
        this.userId = user.userId;
        this.userName = user.name || '';

        this.onBlockSubscribe = blackListManager.onBlockStream.subscribe((userId) => {
            if (userId === this.userId) {
                this.toggleRemoteStream(false);
            }
        });
        this.onUnBlockSubscribe = blackListManager.onUnBlockStream.subscribe((userId) => {
            if (userId === this.userId) {
                this.toggleRemoteStream(true);
            }
        });

        if (blackListManager.isBlackListed(this.userId)) {
        }
    }


    private toggleRemoteStream(enable: boolean) {
        this.remoteStream.getTracks().forEach(track => track.enabled = enable);
        mediaManager.toggleBlockLogo(this.userId, !enable);
    }

    streamFromTrack(track: MediaStreamTrack) {
        try {
            if (!this.remoteStream) {
                this.remoteStream = new MediaStream;
            }
            this.remoteStream.addTrack(track);
            if (blackListManager.isBlackListed(this.userId) || this.blocked) {
                this.toggleRemoteStream(false);
            }
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
            this.onBlockSubscribe.unsubscribe();
            this.onUnBlockSubscribe.unsubscribe();
            mediaManager.removeActiveVideo("" + this.userId);
            // FIXME: I don't understand why "Closing connection with" message is displayed TWICE before "Nb users in peerConnectionArray"
            // I do understand the method closeConnection is called twice, but I don't understand how they manage to run in parallel.
            // super.destroy(error);
        } catch (err) {
            console.error("VideoPeer::destroy", err)
        }
    }


}
