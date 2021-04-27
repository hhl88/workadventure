import protooClient from 'protoo-client';
import {WebRtcDisconnectMessageInterface,} from "../Connexion/ConnexionModels";
import {Transport} from "mediasoup-client/lib/Transport";
import {Device} from "mediasoup-client";
import {
    mediaManager,
    StartScreenSharingCallback,
    StopScreenSharingCallback,
    UpdatedLocalStreamCallback
} from "./MediaManager";
import {RtpCapabilities} from "mediasoup-client/src/RtpParameters";
import {utils} from "../Utils/Utils";
import {MAX_PER_GROUP, SEEME_SECURE_CONNECTION, SEEME_URL} from "../Enum/EnvironmentVariable";
import {Consumer} from "mediasoup-client/lib/Consumer";
import {Producer} from "mediasoup-client/lib/Producer";
import {SeeMeVideo} from "./SeeMeVideo";
import {RoomConnection} from "../Connexion/RoomConnection";
import {UserSimplePeerInterface} from "./SimplePeer";
import {SeeMeScreenSharing} from "./SeeMeScreenSharing";

export interface RoomCreatedInterface {
    id: string
}

/**
 * This class manages connections to all the peers in the same group as me.
 */
export class SeeMePeer {
    private readonly sendLocalVideoStreamCallback: UpdatedLocalStreamCallback;
    private readonly sendLocalAudioStreamCallback: UpdatedLocalStreamCallback;

    private readonly sendLocalScreenSharingStreamCallback: StartScreenSharingCallback;
    private readonly stopLocalScreenSharingStreamCallback: StopScreenSharingCallback;
    private mediasoupDevice: Device;
    private protoo?: protooClient.Peer;
    private sendTransport?: Transport;
    private recvTransport?: Transport;
    private webcamProducer?: Producer;
    private micProducer?: Producer;
    private shareVideoProducer?: Producer;

    private isClosed: boolean;
    private isConnected: boolean;
    private loadedRtpCapabilities: boolean;

    private consumers: Map<String, Consumer>;
    private peers: Map<number, SeeMeVideo>;
    private readonly currentScreenSharing: SeeMeScreenSharing;
    private readonly userId: number;
    private roomId: number | undefined;
    private isSharingScreen: boolean;

    constructor(private Connection: RoomConnection, private myName: string) {
        // We need to go through this weird bound function pointer in order to be able to "free" this reference later.
        this.sendLocalVideoStreamCallback = this.sendLocalVideoStream.bind(this);
        this.sendLocalAudioStreamCallback = this.sendLocalAudioStream.bind(this);

        this.sendLocalScreenSharingStreamCallback = this.sendLocalScreenSharingStream.bind(this);
        this.stopLocalScreenSharingStreamCallback = this.stopLocalScreenSharingStream.bind(this);

        mediaManager.onUpdateVideoLocalStream(this.sendLocalVideoStreamCallback);
        mediaManager.onUpdateAudioLocalStream(this.sendLocalAudioStreamCallback);

        mediaManager.onStartScreenSharing(this.sendLocalScreenSharingStreamCallback);
        mediaManager.onStopScreenSharing(this.stopLocalScreenSharingStreamCallback);
        this.userId = this.Connection.getUserId();
        this.initialise();
        this.isClosed = true;
        this.isConnected = false;
        this.loadedRtpCapabilities = false;
        this.consumers = new Map();
        this.mediasoupDevice = new Device();
        this.peers = new Map();
        this.currentScreenSharing = new SeeMeScreenSharing();
        this.isSharingScreen = false;
    }

    /**
     * permit to listen when user could start visio
     */
    private initialise() {

        mediaManager.showGameOverlay();
        mediaManager.getCamera().then(() => {
        }).catch((err) => {
            console.error("err", err);
        });

        this.Connection.receiveWebrtcStart(async (message: UserSimplePeerInterface) => {
            if (message.roomId && message) {
                await this.connectToRoom(message.roomId);
            }
        })


        this.Connection.disconnectMessage((data: WebRtcDisconnectMessageInterface): void => {
            if (data.userId === this.userId) {
                this.close();
            } else {
                mediaManager.removeActiveVideo("" + data.userId);
                this.peers.delete(data.userId);
            }
        });
    }

    /**
     * Unregisters any held event handler.
     */
    public unregister() {
        mediaManager.removeUpdateLocalStreamEventListener(this.sendLocalVideoStreamCallback);
        mediaManager.removeUpdateLocalStreamEventListener(this.sendLocalAudioStreamCallback);
    }

    private async sendLocalVideoStream() {
        if (this.isConnected) {
            const localStream: MediaStream | null = mediaManager.localStream;
            if (!localStream) {
                return;
            }
            const videoTracks = localStream.clone().getVideoTracks();
            if (videoTracks && videoTracks.length > 0) {
                const track = videoTracks[0].clone();
                try {
                    this.webcamProducer = await this.sendTransport?.produce(
                        {
                            track,
                            codecOptions: {
                                videoGoogleStartBitrate: 1000
                            },
                            appData: {name: this.myName}
                        });

                    this.webcamProducer?.on('transportclose', () => {
                        this.webcamProducer = undefined;
                    });

                    this.webcamProducer?.on('trackended', () => {
                        this.disableWebcam()
                            .catch(() => {
                            });
                    });
                } catch (e) {
                    if (track) {
                        track.stop();
                    }
                }


            }
        }
    }

    private async sendLocalAudioStream() {
        if (this.isConnected) {
            const localStream: MediaStream | null = mediaManager.localStream;
            if (!localStream) {
                return;
            }

            const audioTracks = localStream.clone().getAudioTracks();

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
                            appData: {name: this.myName}
                        });
                    this.micProducer?.on('transportclose', () => {
                        this.micProducer = undefined;
                    });

                    this.micProducer?.on('trackended', () => {
                        this.disableMic()
                            .catch(() => {
                            });
                    });
                } catch (e) {
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
            const localStream: MediaStream | null = mediaManager.localScreenCapture;
            if (!localStream) {
                console.error('Could not find localScreenCapture to share')
                return;
            }

            const videoTracks = localStream.clone().getVideoTracks();
            if (videoTracks && videoTracks.length > 0) {
                const track = videoTracks[0].clone();

                let encodings;
                let codec;
                const codecOptions =
                    {
                        videoGoogleStartBitrate: 1000
                    };

                this.shareVideoProducer = await this.sendTransport?.produce(
                    {
                        track,
                        encodings,
                        codecOptions,
                        codec,
                        appData:
                            {
                                share: true
                            }
                    });
                this.currentScreenSharing.destroy();

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
    public stopLocalScreenSharingStream(stream: MediaStream) {
        this.isSharingScreen = false;
        this.stopLocalScreenSharingStreamToUser();
        this.disableShare().catch(e => {
            console.error('e', e)
        });
    }

    private stopLocalScreenSharingStreamToUser(): void {
        this.currentScreenSharing.destroy();
    }

    async connectToRoom(roomId: number): Promise<boolean> {
        if (!this.isConnected) {
            this.roomId = roomId;
            const baseUrl = `${SEEME_SECURE_CONNECTION ? 'https' : 'http'}://${SEEME_URL}`;
            try {
                await utils.makeRequest<RoomCreatedInterface>(`${baseUrl}/rooms?modId=${this.userId}&roomId=${roomId}&disableAutoClosingRoom=false&enableModerator=false&enableStandby=false&maxAudience=${MAX_PER_GROUP}`, {method: 'POST'});
            } catch (e) {
                const flag = await utils.retryMakeRequest(`${baseUrl}/rooms/${roomId}`);
                if (!flag) {
                    throw Error('Cannot connect to room');
                }
            }

            const url = `${SEEME_SECURE_CONNECTION ? 'wss' : 'ws'}://${SEEME_URL}/?roomId=${roomId}&peerId=${this.userId}`;
            const protooTransport = new protooClient.WebSocketTransport(url, {headers: {'Sec-WebSocket-Protocol': 'protoo'}});

            this.protoo = new protooClient.Peer(protooTransport);

            this.protoo.on('open', () => this.joinRoom());
            this.protoo.on('failed', () => {
            });

            this.protoo.on('disconnected', () => {
                // Close mediasoup Transports.
                this.sendTransport?.close();
                this.sendTransport = undefined;

                this.recvTransport?.close();
                this.recvTransport = undefined;
            });

            this.protoo.on('close', () => {
                this.close();
            });

            this.protoo.on('request', async (request, accept, reject) => {
                // console.log('proto "request" event [method:%s, data:%o]', request.method, request.data);

                switch (request.method) {
                    case 'newConsumer': {

                        const {
                            peerId,
                            producerId,
                            id,
                            kind,
                            rtpParameters,
                            type,
                            appData,
                            producerPaused
                        } = request.data;
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
                                    appData: {...appData, peerId} // Trick.
                                });

                            // Store in the map.
                            if (consumer) {
                                this.consumers.set(consumer.id, consumer);
                                consumer.on('transportclose', () => {
                                    this.consumers.delete(consumer.id);
                                });

                                if (appData.share) {
                                    if (this.currentScreenSharing) {
                                        this.currentScreenSharing.destroy();
                                    }
                                    this.currentScreenSharing.streamFromTrack(consumer.track);
                                    if (this.isSharingScreen) {
                                        mediaManager.disableScreenSharingStyle();
                                        // this.disableShare().catch(() => {
                                        //     this.isSharingScreen = true;
                                        // })
                                    }
                                } else {
                                    mediaManager.addSeeMeActiveVideo({
                                        userId: peerId,
                                        name: appData.name,
                                        roomId: this.roomId
                                    }, appData.name);
                                    let peer!: SeeMeVideo;
                                    if (this.peers.has(peerId)) {
                                        peer = this.peers.get(peerId)!!;
                                    } else {
                                        peer = new SeeMeVideo({
                                            userId: peerId,
                                            name: appData.name,
                                            roomId: this.roomId
                                        });
                                    }

                                    peer.streamFromTrack(consumer.track);
                                    peer.toClose = false;
                                    this.peers.set(peerId, peer);

                                    if (kind === 'video') {
                                        // const stream = new MediaStream;
                                        // stream.addTrack(consumer.track);
                                        mediaManager.enabledVideoByUserId(peerId);
                                    } else if (kind === 'audio') {
                                        mediaManager.enabledMicrophoneByUserId(peerId);
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

            this.protoo.on('notification', async (notification) => {
                switch (notification.method) {
                    case 'peerClosed': {
                        const {peerId} = notification.data;
                        mediaManager.removeActiveVideo("" + peerId);
                        if (this.currentScreenSharing.isReceivingScreenSharingStream()) {
                            this.currentScreenSharing.destroy();
                        }
                        this.peers.delete(peerId);
                        break;
                    }
                    case 'consumerClosed': {
                        const {consumerId, appData} = notification.data;
                        const consumer = this.consumers.get(consumerId);

                        if (appData.share) {
                            this.shareVideoProducer?.close();
                            this.shareVideoProducer = undefined;
                            this.currentScreenSharing.destroy();
                        } else {
                            this.webcamProducer?.close();
                            this.micProducer?.close();

                            this.webcamProducer = undefined;
                            this.micProducer = undefined;
                        }

                        if (!consumer)
                            break;

                        consumer.close();

                        break;
                    }

                    case 'consumerPaused': {
                        const {consumerId, appData} = notification.data;
                        const consumer = this.consumers.get(consumerId);

                        if (appData.share) {
                            this.shareVideoProducer?.pause();
                        } else {
                            this.webcamProducer?.pause();
                            this.micProducer?.pause();
                        }

                        if (!consumer)
                            break;

                        consumer.pause();

                        break;
                    }

                    case 'consumerResumed': {
                        const {consumerId, appData} = notification.data;
                        const consumer = this.consumers.get(consumerId);

                        if (appData.share) {
                            this.shareVideoProducer?.resume();
                        } else {
                            this.webcamProducer?.resume();
                            this.micProducer?.resume();
                        }

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
                });
            if (res) {
                await this.sendLocalVideoStream();
                await this.sendLocalAudioStream();
                if (this.isSharingScreen) {
                    await this.sendLocalScreenSharingStream();
                }
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


    close() {
        if (this.isClosed)
            return;

        this.isClosed = true;
        this.isConnected = false;
        // this.isSharingScreen = false;

        // Close protoo Peer
        this.protoo?.close();
        this.protoo = undefined;

        // Close mediasoup Transports.
        this.sendTransport?.close();
        this.sendTransport = undefined;

        this.recvTransport?.close();
        this.recvTransport = undefined;

        this.peers = new Map<number, SeeMeVideo>();
        this.currentScreenSharing.destroy();
    }
}
