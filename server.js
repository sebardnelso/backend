const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

let db = mysql.createPool({
    connectionLimit: 10, // Número máximo de conexiones en el pool
    host: '190.228.29.61',
    user: 'kalel2016',
    password: 'Kalel2016',
    database: 'ausoltest',
    waitForConnections: true,
    queueLimit: 0,
    debug: false
});

// Re-crear el pool en caso de pérdida de conexión
const handleDbError = (err) => {
    console.error('Database connection error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        // Reconectar en caso de pérdida de conexión
        console.log('Reconnecting to the database...');
        db = mysql.createPool({
            connectionLimit: 10,
            host: '190.228.29.61',
            user: 'kalel2016',
            password: 'Kalel2016',
            database: 'ausoltest',
            waitForConnections: true,
            queueLimit: 0,
            debug: false
        });
    }
};

db.on('error', handleDbError);

// Endpoint de login
app.post('/login', (req, res) => {
    const { nombre, password } = req.body;
    const query = 'SELECT * FROM aus_usuario WHERE nombre = ? AND password = ?';
    db.query(query, [nombre, password], (err, results) => {
        if (err) {
            handleDbError(err);
            res.status(500).send(err);
            return;
        }
        if (results.length > 0) {
            const zona = results[0].zona;
            res.send({ success: true, zona });
        } else {
            res.send({ success: false });
        }
    });
});

// Endpoint para obtener clientes
app.get('/clientes', (req, res) => {
    const { zona } = req.query;
    // Filtrar clientes donde ter != 1
    const query = 'SELECT DISTINCT codcli, fecha, realiza FROM aus_ped WHERE zona = ? AND ter != 1';
    db.query(query, [zona], (err, results) => {
        if (err) {
            handleDbError(err);
            res.status(500).send(err);
            return;
        }
        res.send(results);
    });
});

// Endpoint para obtener pedidos por codcli
app.get('/pedidos/:codcli', (req, res) => {
    const { codcli } = req.params;
    const query = 'SELECT * FROM aus_ped WHERE codcli = ? and zona = ?';
    db.query(query, [codcli], (err, results) => {
        if (err) {
            handleDbError(err);
            res.status(500).send(err);
            return;
        }
        res.send(results);
    });
});

// Endpoint para finalizar pedidos
app.post('/pedidos/finalizar', (req, res) => {
    const updates = req.body.updates;

    // Construir una consulta que actualice varios registros
    let queries = updates.map(update => {
        return new Promise((resolve, reject) => {
            const query = 'UPDATE aus_ped SET cantidad_real = ?, ter = ? WHERE codori = ?';
            db.query(query, [update.cantidad_real, update.ter, update.codori], (err, results) => {
                if (err) {
                    return reject(err);
                }
                resolve(results);
            });
        });
    });

    // Ejecutar todas las consultas en paralelo
    Promise.all(queries)
        .then(results => {
            res.json({ success: true });
        })
        .catch(err => {
            console.error('Error finalizing orders:', err);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        });
});

// Endpoint para actualizar pedidos
app.put('/pedidos/:codori', (req, res) => {
    const { codori } = req.params;
    const { ter, cantidad_real } = req.body;
    const query = 'UPDATE aus_ped SET ter = ?, cantidad_real = ? WHERE codori = ?';
    db.query(query, [ter, cantidad_real, codori], (err, results) => {
        if (err) {
            handleDbError(err);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
            return;
        }
        res.json({ success: true });
    });
});

// Endpoint para actualizar el campo 'realiza' en pedidos
app.post('/pedidos/actualizar_realiza', (req, res) => {
    const { codcli, realiza } = req.body;
    console.log('Received update request with:', { codcli, realiza }); // Para depuración
    const query = 'UPDATE aus_ped SET realiza = ? WHERE codcli = ?';
    db.query(query, [realiza, codcli], (err, results) => {
        if (err) {
            handleDbError(err);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
            return;
        }
        console.log('Update results:', results); // Para depuración
        res.json({ success: true });
    });
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
