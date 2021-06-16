import {derived, writable} from "svelte/store";

function createRequestedSeeMeConnectionState() {
    const {subscribe, set, update} = writable('closed');
    return {
        subscribe,
        connecting: () => set('connecting'),
        connected: () => set('connected'),
        closed: () => set('closed')
    };
}


export const requestedSeeMeConnectionState = createRequestedSeeMeConnectionState();


let timeout: NodeJS.Timeout;

let previousConnecting: boolean | null = false;
let previousConnected: boolean | null = false;
let previousClosed: boolean | null = false;

export const seeMeStore = derived(
    [
        requestedSeeMeConnectionState,
    ],
    ([
         $requestedSeeMeConnectionState,
     ], set
    ) => {
        let connecting: boolean = false;
        let connected: boolean = false;
        let closed: boolean = false;

        switch ($requestedSeeMeConnectionState) {
            case 'closed': {
                connecting = false;
                connected = false;
                closed = true;
                break;
            }
            case 'connecting': {
                connecting = true;
                connected = false;
                closed = false;
                break;
            }
            case 'connected': {
                connecting = false;
                connected = true;
                closed = false;
                break;
            }
            default: {
                connecting = false;
                connected = false;
                closed = false;
            }
        }

        if (previousConnecting !== connecting || previousConnected !== connected || previousClosed !== closed) {
            previousConnecting = connecting;
            previousConnected = connected;
            previousClosed = closed;
            if (timeout) {
                clearTimeout(timeout);
            }

            timeout = setTimeout(() => {
                set({
                    connecting,
                    connected,
                    closed
                });
            }, 100);
        }


    }, {
        connecting: false,
        connected: false,
        closed: false
    }
)


