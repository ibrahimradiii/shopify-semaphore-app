const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

let orderAnalytics = [];
let templates = [
    { id: uuidv4(), name: 'Order Created', type: 'order_create', content: 'Thank you for your order, {{customer_name}}! Your order number is {{order_id}}.', schedule: 'instant' },
    { id: uuidv4(), name: 'Order Fulfilled', type: 'order_fulfilled', content: 'Good news, {{customer_name}}! Your order {{order_id}} has been fulfilled and is on its way!', schedule: 'instant' },
    { id: uuidv4(), name: 'Abandoned Cart', type: 'abandoned_cart', content: 'Hi {{customer_name}}, it looks like you left some items in your cart. Complete your purchase at {{cart_url}}.', schedule: 'instant' }
];

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(cookieParser());
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    res.render('home');
});

app.get('/dashboard', (req, res) => {
    res.render('dashboard');
});

app.get('/custom-message', (req, res) => {
    res.render('custom-message');
});

app.get('/templates', (req, res) => {
    res.render('templates');
});

app.get('/api/templates', (req, res) => {
    res.json(templates);
});

app.post('/api/templates', (req, res) => {
    const { name, type, content, schedule = 'instant' } = req.body;
    const newTemplate = { id: uuidv4(), name, type, content, schedule };
    templates.push(newTemplate);
    res.status(201).json(newTemplate);
});

app.put('/api/templates/:id', (req, res) => {
    const { id } = req.params;
    const { content, schedule } = req.body;
    const templateIndex = templates.findIndex(t => t.id === id);
    if (templateIndex !== -1) {
        templates[templateIndex].content = content;
        templates[templateIndex].schedule = schedule;
        res.status(200).json(templates[templateIndex]);
    } else {
        res.status(404).json({ message: 'Template not found' });
    }
});

app.delete('/api/templates/:id', (req, res) => {
    const { id } = req.params;
    templates = templates.filter(template => template.id !== id);
    res.status(200).json({ message: 'Template deleted' });
});

app.get('/analytics', (req, res) => {
    res.json(orderAnalytics);
});

app.post('/webhook/order-create', async (req, res) => {
    const order = req.body;
    const template = templates.find(t => t.type === 'order_create');
    const message = template.content.replace('{{customer_name}}', order.customer.first_name).replace('{{order_id}}', order.id);
    const recipient = order.customer.phone;

    if (template.schedule === 'instant') {
        try {
            await sendSMS(message, recipient);
            orderAnalytics.push({
                orderId: order.id,
                customerName: order.customer.first_name,
                phoneNumber: recipient,
                status: 'Success',
                type: 'order_create'
            });
            res.status(200).send('Order create webhook received');
        } catch (error) {
            orderAnalytics.push({
                orderId: order.id,
                customerName: order.customer.first_name,
                phoneNumber: recipient,
                status: 'Failed',
                type: 'order_create'
            });
            res.status(500).send('Error sending SMS');
        }
    } else {
        scheduleSMS(message, recipient, 30 * 60 * 1000); // 30 minutes delay
        orderAnalytics.push({
            orderId: order.id,
            customerName: order.customer.first_name,
            phoneNumber: recipient,
            status: 'Scheduled',
            type: 'order_create'
        });
        res.status(200).send('Order create webhook scheduled');
    }
});

app.post('/webhook/order-fulfilled', async (req, res) => {
    const order = req.body;
    const template = templates.find(t => t.type === 'order_fulfilled');
    const message = template.content.replace('{{customer_name}}', order.customer.first_name).replace('{{order_id}}', order.id);
    const recipient = order.customer.phone;

    if (template.schedule === 'instant') {
        try {
            await sendSMS(message, recipient);
            orderAnalytics.push({
                orderId: order.id,
                customerName: order.customer.first_name,
                phoneNumber: recipient,
                status: 'Success',
                type: 'order_fulfilled'
            });
            res.status(200).send('Order fulfilled webhook received');
        } catch (error) {
            orderAnalytics.push({
                orderId: order.id,
                customerName: order.customer.first_name,
                phoneNumber: recipient,
                status: 'Failed',
                type: 'order_fulfilled'
            });
            res.status(500).send('Error sending SMS');
        }
    } else {
        scheduleSMS(message, recipient, 30 * 60 * 1000); // 30 minutes delay
        orderAnalytics.push({
            orderId: order.id,
            customerName: order.customer.first_name,
            phoneNumber: recipient,
            status: 'Scheduled',
            type: 'order_fulfilled'
        });
        res.status(200).send('Order fulfilled webhook scheduled');
    }
});

app.post('/webhook/abandoned-cart', async (req, res) => {
    const cart = req.body;
    const template = templates.find(t => t.type === 'abandoned_cart');
    const message = template.content.replace('{{customer_name}}', cart.customer.first_name).replace('{{cart_url}}', cart.cart_url);
    const recipient = cart.customer.phone;

    if (template.schedule === 'instant') {
        try {
            await sendSMS(message, recipient);
            orderAnalytics.push({
                orderId: cart.id,
                customerName: cart.customer.first_name,
                phoneNumber: recipient,
                status: 'Success',
                type: 'abandoned_cart'
            });
            res.status(200).send('Abandoned cart webhook received');
        } catch (error) {
            orderAnalytics.push({
                orderId: cart.id,
                customerName: cart.customer.first_name,
                phoneNumber: recipient,
                status: 'Failed',
                type: 'abandoned_cart'
            });
            res.status(500).send('Error sending SMS');
        }
    } else {
        scheduleSMS(message, recipient, 30 * 60 * 1000); // 30 minutes delay
        orderAnalytics.push({
            orderId: cart.id,
            customerName: cart.customer.first_name,
            phoneNumber: recipient,
            status: 'Scheduled',
            type: 'abandoned_cart'
        });
        res.status(200).send('Abandoned cart webhook scheduled');
    }
});

app.post('/send-sms', async (req, res) => {
    const { message, phone } = req.body;
    if (!isValidPhoneNumber(phone)) {
        return res.status(400).json({ message: 'Invalid phone number format' });
    }

    try {
        await sendSMS(message, phone);
        res.json({ message: 'SMS sent successfully!' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to send SMS' });
    }
});

const sendSMS = async (message, recipient) => {
    try {
        const response = await axios.post('https://api.semaphore.co/api/v4/messages', {
            apikey: process.env.SEMAPHORE_API_KEY,
            message: message,
            number: recipient,
        });
        return response.data;
    } catch (error) {
        throw new Error('Failed to send SMS');
    }
};

const scheduleSMS = (message, recipient, delay) => {
    setTimeout(() => {
        sendSMS(message, recipient).catch(error => console.error('Scheduled SMS failed:', error));
    }, delay);
};

const isValidPhoneNumber = (phone) => {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
};

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
