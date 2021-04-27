class Utils {

    makeRequest<T>(url: string, opts = {}): Promise<T> {
        return fetch(url, opts)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.statusText)
                }
                return response.json();
            })
            .then(data => {
                return data
            })
            .catch((error: Error) => {
                console.error(error) /* <-- made up logging service */
                throw error /* <-- rethrow the error so consumer can still catch it */
            })
    }

    async retryMakeRequest(url: string, opts = {}, maxRetries = 10, delayMs = 500) {
        let flag = true;
        let ok = false;
        let counter = 0;
        while (flag) {
            try {
                await this.makeRequest(url, opts);
                flag = false;
                ok = true;
            } catch (e) {
                await this.delay(delayMs);
                counter++;
                if (counter >= maxRetries) {
                    break;
                }
            }
        }
        return ok;
    }

    delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    generateRandomNumber = function () {
        return Math.round(Math.random() * 10000000);
    };

}

export const utils = new Utils();
