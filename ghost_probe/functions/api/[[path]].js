export async function onRequest(context) {
    const url = new URL(context.request.url);
    const apiPath = url.pathname.replace('/api', ''); // strip /api prefix if needed, or keep it depending on target.
    // The target is tanzhen.848880.xyz/api/... so we keep the path structure.

    // We want to forward /api/status/batch -> https://tanzhen.848880.xyz/api/status/batch
    // context.request.url is https://tz.../api/status/batch

    const targetUrl = 'https://tanzhen.848880.xyz' + url.pathname + url.search;

    // Recreate the request
    const newRequest = new Request(targetUrl, context.request);

    return fetch(newRequest);
}
