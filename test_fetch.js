const subscriptionService = require('./src/services/subscription');

async function test() {
    console.log('Testing fetch with updated logic (proxy: false)...');
    try {
        const url = 'https://host.leiterup.de/genshinimpact/huawei/v50tome?token=84d40f86c34066628892bea1f9ba7c99';
        const result = await subscriptionService.getNodes(url);
        console.log('Fetch Result Format:', result.type);
        
        let nodeCount = 0;
        if (result.type === 'clash_direct') {
            nodeCount = result.proxies.length;
        } else {
            nodeCount = result.nodes.length;
        }
        
        console.log('Successfully fetched and parsed nodes:', nodeCount);
        if (nodeCount > 1) {
            console.log('SUCCESS! More than 1 node found.');
        } else {
            console.log('FAILURE: Still 1 or 0 nodes.');
        }
    } catch (e) {
        console.error('Test failed with error:', e);
    }
}

test();
