import protooClient from 'protoo-client';
import type {WebRtcDisconnectMessageInterface,} from "../Connexion/ConnexionModels";
import type {Transport} from "mediasoup-client/lib/Transport";
import {Device} from "mediasoup-client";
import {mediaManager} from "./MediaManager";
import type {RtpCapabilities} from "mediasoup-client/src/RtpParameters";
import {utils} from "../Utils/Utils";
import {MAX_PER_GROUP, SEEME_SECURE_CONNECTION, SEEME_URL} from "../Enum/EnvironmentVariable";
import type {Consumer} from "mediasoup-client/lib/Consumer";
import type {Producer} from "mediasoup-client/lib/Producer";
import {SeeMeVideo} from "./SeeMeVideo";
import type {RoomConnection} from "../Connexion/RoomConnection";
import type {UserSimplePeerInterface} from "./SimplePeer";
import {SeeMeScreenSharing} from "./SeeMeScreenSharing";
import cryptoRandomString from 'crypto-random-string';
import {get} from "svelte/store";
import {localStreamStore,} from "../Stores/MediaStore";
import {requestedSeeMeConnectionState,} from "../Stores/SeeMeStore";
import {screenSharingLocalStreamStore} from "../Stores/ScreenSharingStore";

enum SharingState {
    OFF,
    ON,
}

export interface RoomCreatedInterface {
    id: string
}

export interface SeeMeData {
    userId: number;
    peerId: string;
}

export interface SeeMePeer {
    id: string;
    displayName: string;
    appData: SeeMeData
}

/**
 * This class manages connections to all the peers in the same group as me.
 */
export class SeeMePeer {
    private mediasoupDevice: Device;
    private protoo?: protooClient.Peer;
    private sendTransport?: Transport;
    private recvTransport?: Transport;
    private webcamProducer?: Producer;
    private micProducer?: Producer;
    private shareVideoProducer?: Producer;

    private isClosed: boolean;
    private isConnected: boolean;
    private isConnecting: boolean;
    private loadedRtpCapabilities: boolean;

    private consumers: Map<String, Consumer>;
    private userPeers: Map<number, SeeMeVideo>;
    private peerUsers: Map<string, number>;
    private readonly currentScreenSharing: SeeMeScreenSharing;
    private readonly userId: number;
    private roomId: number | undefined;
    private readonly peerId: string;
    private isSharingScreen: boolean;
    private isSharingWebcam: boolean;
    private isSharingMic: boolean;
    private prevMicState: SharingState;
    private prevWebcamState: SharingState;

    private readonly unsubscribers: (() => void)[] = [];

    constructor(private Connection: RoomConnection, private myName: string) {

        this.userId = this.Connection.getUserId();
        this.peerId = localStorage.getItem('seeme.peerId') || cryptoRandomString({length: 8}).toLowerCase();
        localStorage.setItem('seeme.peerId', this.peerId);

        this.initialise();
        this.isClosed = true;
        this.isConnected = false;
        this.loadedRtpCapabilities = false;
        this.consumers = new Map();
        this.mediasoupDevice = new Device();
        this.userPeers = new Map();
        this.peerUsers = new Map();
        this.currentScreenSharing = new SeeMeScreenSharing(this.userId);
        this.isSharingScreen = false;
        this.isConnecting = false;
        this.isSharingWebcam = false;
        this.isSharingMic = false;
        this.prevMicState = SharingState.OFF;
        this.prevWebcamState = SharingState.OFF;
    }

    /**
     * permit to listen when user could start visio
     */
    private initialise() {

        mediaManager.showGameOverlay();

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.Connection.receiveWebrtcStart(async (message: UserSimplePeerInterface) => {
            if (message.roomId && message) {
                if (!this.isConnecting) {
                    this.isConnecting = true;
                    requestedSeeMeConnectionState.connecting();
                    await this.connectToRoom(message.roomId);
                }
            }
        })


        this.Connection.disconnectMessage((data: WebRtcDisconnectMessageInterface): void => {
            if (data.userId === this.userId) {
                this.close();
            } else {
                mediaManager.removeActiveVideo("" + data.userId);
                this.userPeers.delete(data.userId);
                for (const peerId of this.peerUsers.keys()) {
                    if (this.peerUsers.get(peerId) === data.userId) {
                        this.peerUsers.delete(peerId);
                    }
                }
            }
        });

        this.unsubscribers.push(localStreamStore.subscribe((streamResult) => {
            if (streamResult.type === 'error') {
                // Let's ignore screen sharing errors, we will deal with those in a different way.
                return;
            }
            if (streamResult.constraints) {
                if (this.isSharingWebcam) {
                    this.toggleWebcam(!!streamResult.constraints.video)
                } else {
                    if (streamResult.constraints.video)
                        this.sendLocalVideoStream();
                }

                if (this.isSharingMic) {
                    this.toggleMic(!!streamResult.constraints.audio)
                } else {
                    if (streamResult.constraints.audio)
                        this.sendLocalAudioStream();
                }
            }

        }));

        this.unsubscribers.push(screenSharingLocalStreamStore.subscribe((streamResult) => {
            if (streamResult.type === 'error') {
                // Let's ignore screen sharing errors, we will deal with those in a different way.
                return;
            }
            if (this.isSharingScreen) {
                this.stopLocalScreenSharingStream();
            } else {
                this.sendLocalScreenSharingStream();
            }
        }));
    }

    /**
     * Unregisters any held event handler.
     */
    public unregister() {
        for (const unsubscriber of this.unsubscribers) {
            unsubscriber();
        }
    }

    public getPeerId(): String {
        return this.peerId;
    }


    private getStream(type: String) {
        const streamResult = get(localStreamStore);
        // @ts-ignore
        if (streamResult.type === 'success' && streamResult.stream && streamResult.constraints[type]) {
            return streamResult.stream;
        }
        return null;
    }

    private getScreenShareStream() {
        const streamResult = get(screenSharingLocalStreamStore);
        if (streamResult.type === 'success' && streamResult.stream !== null) {
            return streamResult.stream;
        }
        return null;
    }

    private toggleMic(enable: boolean) {
        if (enable) {
            this.resumeMic();
        } else {
            this.pauseMic();
        }
    }

    private toggleWebcam(enable: boolean) {
        if (enable) {
            this.resumeWebcam();
        } else {
            this.pauseWebcam();
        }
    }

    private async sendLocalVideoStream() {
        this.isSharingWebcam = false;
        this.prevWebcamState = SharingState.OFF;

        if (this.isConnected) {
            const localStream: MediaStream | null = this.getStream('video');
            if (!localStream) {
                return;
            }
            const videoTracks = localStream.getVideoTracks();
            if (videoTracks && videoTracks.length > 0) {
                const track = videoTracks[0].clone();
                this.isSharingWebcam = track.enabled;

                try {
                    this.webcamProducer = await this.sendTransport?.produce(
                        {
                            track,
                            codecOptions: {
                                videoGoogleStartBitrate: 1000
                            },
                            appData: {name: this.myName, userId: this.userId}
                        });

                    this.webcamProducer?.on('transportclose', () => {
                        this.webcamProducer = undefined;
                    });

                    this.webcamProducer?.on('trackended', () => {
                        this.disableWebcam()
                            .catch(() => {
                            });
                    });
                    this.isSharingWebcam = true;
                    this.prevWebcamState = track.enabled ? SharingState.ON : SharingState.OFF;
                } catch (e) {
                    this.isSharingWebcam = false;
                    this.prevWebcamState = SharingState.OFF;
                    if (track) {
                        track.stop();
                    }
                }
            }
        }
    }

    private async sendLocalAudioStream() {
        this.isSharingMic = false;
        this.prevMicState = SharingState.OFF;

        if (this.isConnected) {
            const localStream: MediaStream | null = this.getStream('audio');
            if (!localStream) {
                return;
            }

            const audioTracks = localStream.getAudioTracks();

            if (audioTracks && audioTracks.length > 0) {
                const track = audioTracks[0].clone();
                try {
                    this.micProducer = await this.sendTransport?.produce(
                        {
                            track,
                            codecOptions:
                                {
                                    opusStereo: true,
                                    opusDtx: true
                                },
                            appData: {name: this.myName, userId: this.userId}
                        });
                    this.micProducer?.on('transportclose', () => {
                        this.micProducer = undefined;
                    });

                    this.micProducer?.on('trackended', () => {
                        this.disableMic()
                            .catch(() => {
                            });
                    });
                    this.isSharingMic = true;
                    this.prevMicState = track.enabled ? SharingState.ON : SharingState.OFF;
                } catch (e) {
                    this.isSharingMic = false;
                    this.prevMicState = SharingState.OFF;
                    if (track) {
                        track.stop();
                    }
                }


            }
        }
    }

    /**
     * Triggered locally when clicking on the screen sharing button
     */
    public async sendLocalScreenSharingStream() {
        this.isSharingScreen = true;
        if (this.isConnected) {
            const localStream: MediaStream | null = this.getScreenShareStream();

            if (!localStream) {
                console.error('Could not find localScreenCapture to share')
                return;
            }

            const videoTracks = localStream.getVideoTracks();
            if (videoTracks && videoTracks.length > 0) {
                const track = videoTracks[0].clone();

                const codecOptions =
                    {
                        videoGoogleStartBitrate: 1000
                    };

                this.shareVideoProducer = await this.sendTransport?.produce(
                    {
                        track,
                        codecOptions,
                        appData:
                            {
                                share: true,
                                peerId: this.peerId,
                                userId: this.userId
                            }
                    });
                this.currentScreenSharing.destroyCurrent();

                this.shareVideoProducer?.on('transportclose', () => {
                    this.shareVideoProducer = undefined;
                });

                this.shareVideoProducer?.on('trackended', () => {
                    this.disableShare()
                        .catch(() => {
                        });
                });
            }
        }
    }

    /**
     * Triggered locally when clicking on the screen sharing button
     */
    public stopLocalScreenSharingStream() {
        if (!this.isSharingScreen) {
            return;
        }
        this.isSharingScreen = false;
        this.currentScreenSharing.destroyMySelf();
        this.disableShare().catch(e => {
            console.error('e', e)
        });
    }

    async connectToRoom(roomId: number): Promise<boolean> {

        if (!this.isConnected) {

            this.roomId = roomId;
            const baseUrl = `${SEEME_SECURE_CONNECTION ? 'https' : 'http'}://${SEEME_URL}`;
            try {
                await utils.makeRequest<RoomCreatedInterface>(`${baseUrl}/rooms?modId=${this.peerId}&roomId=${roomId}&disableAutoClosing=false&type=chatRoom&maxAudience=${MAX_PER_GROUP}`, {method: 'POST'});
            } catch (e) {
                const flag = await utils.retryMakeRequest(`${baseUrl}/rooms/${roomId}`);
                if (!flag) {
                    throw Error('Cannot connect to room');
                }
            }
            const url = `${SEEME_SECURE_CONNECTION ? 'wss' : 'ws'}://${SEEME_URL}/?roomId=${roomId}&peerId=${this.peerId}`;
            const protooTransport = new protooClient.WebSocketTransport(url, {headers: {'Sec-WebSocket-Protocol': 'protoo'}});

            this.protoo = new protooClient.Peer(protooTransport);

            this.protoo.on('open', () => this.joinRoom());
            this.protoo.on('failed', (e) => {

            });

            this.protoo.on('disconnected', () => {
                // Close mediasoup Transports.
                this.sendTransport?.close();
                this.sendTransport = undefined;

                this.recvTransport?.close();
                this.recvTransport = undefined;
            });

            this.protoo.on('close', () => {
                if (this.isClosed)
                    return;
                this.close();
            });

            this.protoo.on('request', async (request, accept, reject) => {
                switch (request.method) {
                    case 'newConsumer': {
                        const {
                            peerId,
                            producerId,
                            id,
                            kind,
                            rtpParameters,
                            appData,
                        } = request.data;

                        const {userId} = appData;

                        if (appData.standBy) {
                            break;
                        }

                        try {
                            const consumer = await this.recvTransport?.consume(
                                {
                                    id,
                                    producerId,
                                    kind,
                                    rtpParameters,
                                    appData: {...appData, userId, peerId} // Trick.
                                });

                            // Store in the map.
                            if (consumer) {
                                this.consumers.set(consumer.id, consumer);
                                consumer.on('transportclose', () => {
                                    this.consumers.delete(consumer.id);
                                });

                                if (appData.share) {
                                    if (this.currentScreenSharing) {
                                        this.currentScreenSharing.destroyCurrent();
                                    }
                                    this.currentScreenSharing.streamFromTrack(userId, consumer.track);

                                } else {
                                    mediaManager.addSeeMeActiveVideo({
                                        userId: userId,
                                        name: appData.name,
                                        roomId: this.roomId
                                    }, appData.name);
                                    let peer!: SeeMeVideo;
                                    if (this.userPeers.has(userId)) {
                                        peer = this.userPeers.get(userId)!!;
                                    } else {
                                        peer = new SeeMeVideo({
                                            userId: userId,
                                            name: appData.name,
                                            roomId: this.roomId
                                        });
                                    }

                                    peer.streamFromTrack(consumer.track);
                                    peer.toClose = false;
                                    this.userPeers.set(userId, peer);
                                    this.peerUsers.set(peerId, userId);

                                    if (kind === 'video') {
                                        mediaManager.enabledVideoByUserId(userId);
                                    } else if (kind === 'audio') {
                                        mediaManager.enabledMicrophoneByUserId(userId);
                                    }
                                }
                            }

                            accept();

                        } catch (error) {
                            console.error('"newConsumer" request failed:%o', error);

                            throw error;
                        }

                        break;
                    }
                    default:
                        break;
                }
            });

            // eslint-disable-next-line @typescript-eslint/require-await
            this.protoo.on('notification', async (notification) => {
                switch (notification.method) {

                    case 'newPeer': {
                        this.handleNewPeer(notification.data)
                        break;
                    }

                    case 'peerClosed': {
                        const {peerId} = notification.data;
                        const userId = this.peerUsers.get(peerId);
                        if (userId) {
                            const peer = this.userPeers.get(userId);
                            peer?.destroy();
                            // mediaManager.removeActiveVideo("" + userId);
                            if (this.currentScreenSharing.isReceivingScreenSharingStream()) {
                                this.currentScreenSharing.destroy(userId);
                            }

                            this.userPeers.delete(userId);
                            this.peerUsers.delete(peerId);
                        }

                        break;
                    }
                    case 'consumerClosed': {
                        const {consumerId, appData} = notification.data;
                        const consumer = this.consumers.get(consumerId);
                        if (appData.share) {
                            this.currentScreenSharing.destroy(appData.userId);
                        }

                        if (!consumer)
                            break;

                        consumer.close();
                        this.consumers.delete(consumerId);

                        break;
                    }

                    case 'consumerPaused': {
                        const {consumerId, appData} = notification.data;
                        const consumer = this.consumers.get(consumerId);

                        if (!consumer)
                            break;

                        consumer.pause();

                        break;
                    }

                    case 'consumerResumed': {
                        const {consumerId, appData} = notification.data;
                        const consumer = this.consumers.get(consumerId);

                        if (!consumer)
                            break;

                        consumer.resume();

                        break;
                    }
                    default:
                        break;
                }
            });
        }
        return false;
    }

    private async createSendTransport() {
        const transportInfo = await this.protoo?.request('createWebRtcTransport',
            {
                producing: true,
                consuming: false,
                sctpCapabilities: this.mediasoupDevice.sctpCapabilities
            });

        const {
            id,
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters
        } = transportInfo;

        this.sendTransport = this.mediasoupDevice.createSendTransport(
            {
                id,
                iceParameters,
                iceCandidates,
                dtlsParameters,
                sctpParameters,
                iceServers: [],
                proprietaryConstraints: {
                    optional: [{googDscp: true}]
                }
            });

        this.sendTransport.on('connect', ({dtlsParameters}, callback, errback) => // eslint-disable-line no-shadow
        {
            this.protoo?.request(
                'connectWebRtcTransport',
                {
                    transportId: this.sendTransport?.id,
                    dtlsParameters
                })
                .then(callback)
                .catch(errback);
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.sendTransport.on('produce', async ({kind, rtpParameters, appData}, callback, errback) => {
            try {
                // eslint-disable-next-line no-shadow
                const {id} = await this.protoo?.request(
                    'produce',
                    {
                        transportId: this.sendTransport?.id,
                        kind,
                        rtpParameters,
                        appData
                    });

                callback({id});
            } catch (error) {
                errback(error);
            }
        });
    }

    private async createRecvTransport() {
        const transportInfo = await this.protoo?.request(
            'createWebRtcTransport',
            {
                producing: false,
                consuming: true,
                sctpCapabilities: this.mediasoupDevice.sctpCapabilities
            });

        const {
            id,
            iceParameters,
            iceCandidates,
            dtlsParameters,
            sctpParameters
        } = transportInfo;

        this.recvTransport = this.mediasoupDevice.createRecvTransport(
            {
                id,
                iceParameters,
                iceCandidates,
                dtlsParameters,
                sctpParameters,
                iceServers: []
            });
        this.recvTransport.on(
            'connect', ({dtlsParameters}, callback, errback) => // eslint-disable-line no-shadow
            {
                this.protoo?.request(
                    'connectWebRtcTransport',
                    {
                        transportId: this.recvTransport?.id,
                        dtlsParameters
                    })
                    .then(callback)
                    .catch(errback);
            });
    }

    private async joinRoom() {
        try {
            if (this.protoo) {
                const routerRtpCapabilities: RtpCapabilities = await this.protoo?.request('getRouterRtpCapabilities');
                if (!this.loadedRtpCapabilities) {
                    await this.mediasoupDevice.load({routerRtpCapabilities});
                    this.loadedRtpCapabilities = true;
                }
            }
            requestedSeeMeConnectionState.connected();
            this.isConnected = true;
            this.isClosed = false;
            await this.createSendTransport();
            await this.createRecvTransport();

            const res = await this.protoo?.request(
                'join',
                {
                    displayName: this.myName,
                    device: {},
                    rtpCapabilities: this.mediasoupDevice.rtpCapabilities,
                    sctpCapabilities: this.mediasoupDevice.sctpCapabilities,
                    appData: {userId: this.userId, peerId: this.peerId}
                });
            if (res) {
                await this.sendLocalVideoStream();
                await this.sendLocalAudioStream();
                if (this.isSharingScreen) {
                    await this.sendLocalScreenSharingStream();
                }
                res.peers.forEach((peer: SeeMePeer) => this.handleNewPeer(peer));
            }
        } catch (e) {
            console.error('e', e)
            this.close();
        }
    }

    private async disableWebcam() {
        if (!this.webcamProducer)
            return;

        this.webcamProducer.close();

        try {
            await this.protoo?.request('closeProducer', {producerId: this.webcamProducer.id});
        } catch (error) {
            console.error('Cannot close webcam');
        }

        this.webcamProducer = undefined;
    }

    private async disableMic() {
        if (!this.micProducer)
            return;

        this.micProducer.close();

        try {
            await this.protoo?.request('closeProducer', {producerId: this.micProducer.id});
        } catch (error) {
            console.error('Cannot close microphone');
        }

        this.micProducer = undefined;
    }

    private async disableShare() {
        try {
            if (this.shareVideoProducer) {
                await this.protoo?.request('closeProducer', {producerId: this.shareVideoProducer.id});
                this.shareVideoProducer.close();
            }
        } catch (error) {
            console.error('cannot close producer', error);
        }

        this.shareVideoProducer = undefined;
        this.isSharingScreen = false;
    }

    private pauseMic() {
        if (!this.micProducer)
            return;

        if (this.prevMicState === SharingState.ON) {
            try {
                this.micProducer.pause();
                this.prevMicState = SharingState.OFF;
            } catch (e) {
                console.error('cannot pause microphone', e);

            }
        }
    }

    private pauseWebcam() {
        if (!this.webcamProducer)
            return;

        if (this.prevWebcamState === SharingState.ON) {
            try {
                this.webcamProducer.pause();
                this.prevWebcamState = SharingState.OFF;
            } catch (e) {
                console.error('cannot pause webcam', e);

            }
        }
    }

    private resumeWebcam() {
        if (!this.webcamProducer)
            return;

        if (this.prevWebcamState === SharingState.OFF) {
            try {
                this.webcamProducer.resume();
                this.prevWebcamState = SharingState.ON;
            } catch (e) {
                console.error('cannot resume webcam', e);
            }
        }
    }

    private resumeMic() {
        if (!this.micProducer)
            return;

        if (this.prevMicState === SharingState.OFF) {
            try {
                this.micProducer.resume();
                this.prevMicState = SharingState.ON;
            } catch (e) {
                console.error('cannot resume microphone', e);
            }
        }
    }

    private handleNewPeer(newPeer: SeeMePeer) {
        if (newPeer && newPeer.appData) {
            const {userId, peerId} = newPeer.appData;

            let peer!: SeeMeVideo;
            if (this.userPeers.has(userId)) {
                peer = this.userPeers.get(userId)!!;
            } else {
                peer = new SeeMeVideo({
                    userId: userId,
                    name: newPeer.displayName,
                    roomId: this.roomId
                });
            }
            peer.toClose = false;
            this.userPeers.set(userId, peer);
            this.peerUsers.set(peerId, userId);
            mediaManager.addSeeMeActiveVideo({
                userId: userId,
                name: newPeer.displayName,
                roomId: this.roomId
            }, newPeer.displayName);
        }
    }

    close() {
        if (this.isClosed)
            return;

        requestedSeeMeConnectionState.closed();
        this.isConnecting = false;
        this.isClosed = true;
        this.isConnected = false;

        // Close protoo Peer
        this.protoo?.close();
        this.protoo = undefined;

        // Close mediasoup Transports.
        this.sendTransport?.close();
        this.sendTransport = undefined;

        this.recvTransport?.close();
        this.recvTransport = undefined;

        Object.values(this.userPeers).forEach((peer: SeeMeVideo) => peer.destroy());

        this.userPeers = new Map<number, SeeMeVideo>();
        this.peerUsers = new Map<string, number>();

        this.currentScreenSharing.destroyCurrent();
        this.currentScreenSharing.destroyMySelf();
        this.consumers.forEach((consumer, _) => consumer.close());
    }
}
