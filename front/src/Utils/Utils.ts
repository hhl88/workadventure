class Utils {

    makeRequest<T>(url: string, opts = {}): Promise<T> {
        return fetch(url, opts)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.statusText)
                }
                try {
                    return response.json();
                } catch (e) {
                    return response.text();
                }
            })
            .then(data => {
                return data
            })
            .catch((error: Error) => {
               return ''
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
