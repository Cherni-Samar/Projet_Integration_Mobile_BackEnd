const axios = require('axios');

const N8N_BASE = process.env.N8N_URL || 'http://localhost:5678/webhook';

async function _post(path, body) {
    try {
        const res = await axios.post(`${N8N_BASE}/${path}`, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        return res.data;
    } catch (err) {
        console.error(`N8N Error [${path}]:`, err.message);
        return null; // ✅ Ne bloque pas Express si N8N est down
    }
}

module.exports = {
    hello: (data) => _post('hera', data),
    requestLeave: (data) => _post('hera/leave-request', data),
    urgentLeave: (data) => _post('hera/leave-urgent', data),
    onboarding: (data) => _post('hera/onboarding', data),
    promote: (data) => _post('hera/promotion', data),
    offboarding: (data) => _post('hera/offboarding', data),
    reportAbsence: (data) => _post('hera/absence', data),
};