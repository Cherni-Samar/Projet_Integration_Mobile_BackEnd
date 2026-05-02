const axios = require('axios');

const N8N_BASE = process.env.N8N_URL || 'http://localhost:5678/webhook';

async function _post(path, body) {
    const url = `${N8N_BASE}/${path}`;

    try {
        console.log('📡 N8N URL =>', url);
        console.log('📦 N8N BODY =>', body);

        const res = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });

        return res.data;
    } catch (err) {
        console.error(`N8N Error [${path}] status =>`, err.response?.status);
        console.error(`N8N Error [${path}] url =>`, url);
        console.error(`N8N Error [${path}] message =>`, err.message);
        return null;
    }
}

module.exports = {
    requestLeave: (data) => _post('hera/leave-request', data),
    urgentLeave: (data) => _post('hera/urgent-leave', data),
    refusedLeave: (data) => _post('hera/leave-refused', data),
    onboarding: (data) => _post('hera/onboarding', data),
    promote: (data) => _post('hera/promotion', data),
    offboarding: (data) => _post('hera/offboarding', data),
    reportAbsence: (data) => _post('hera/absence', data),
};