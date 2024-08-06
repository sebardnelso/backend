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

// Endpoint raíz
app.get('/', (req, res) => {
    res.send('servidor funcionando');
});

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

app.get('/pedidos/:codcli', (req, res) => {
    const { codcli } = req.params;
    const { zona } = req.query;
    const query = 'SELECT * FROM aus_ped WHERE codcli = ? AND zona = ? ORDER BY ubicacion ASC';
    db.query(query, [codcli, zona], (err, results) => {
        if (err) {
            handleDbError(err);
            res.status(500).send(err);
            return;
        }
        res.send(results);
    });
});

app.post('/pedidos/verificar_realiza', (req, res) => {
    const { codcli, zona, username } = req.body;
    const query = 'SELECT realiza FROM aus_ped WHERE codcli = ? AND zona = ?';
    db.query(query, [codcli, zona], (err, results) => {
        if (err) {
            console.error('Error querying database:', err);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
            return;
        }
        if (results.length > 0) {
            const realiza = results[0].realiza;
            if (!realiza) {
                // Si el campo 'realiza' está vacío, permitir el pedido
                res.json({ success: false });
            } else if (realiza === username) {
                // Si el campo 'realiza' coincide con el username, permitir el pedido
                res.json({ success: true, canProceed: true });
            } else {
                // Si el campo 'realiza' no coincide con el username, no permitir el pedido
                res.json({ success: true, realiza, canProceed: false });
            }
        } else {
            res.json({ success: false });
        }
    });
});



// Endpoint para actualizar el campo 'realiza' en pedidos
app.post('/pedidos/actualizar_realiza', (req, res) => {
    const { codcli, realiza, zona } = req.body;
    console.log('Received update request with:', { codcli, realiza, zona }); // Para depuración
    const query = 'UPDATE aus_ped SET realiza = ? WHERE codcli = ? AND zona = ?';
    db.query(query, [realiza, codcli, zona], (err, results) => {
        if (err) {
            handleDbError(err);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
            return;
        }
        console.log('Update results:', results); // Para depuración
        res.json({ success: true });
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

// Endpoint para finalizar pedidos
app.post('/pedidos/finalizar', (req, res) => {
    const updates = req.body.updates;

    // Verificar que updates es un array
    if (!Array.isArray(updates)) {
        return res.status(400).json({ success: false, error: 'Invalid data format' });
    }

    // Construir y ejecutar las consultas de actualización
    const queries = updates.map(update => {
        return new Promise((resolve, reject) => {
            // Usar codcli y codori en lugar de solo codori
            const query = 'UPDATE aus_ped SET cantidad_real = ?, ter = ? WHERE codcli = ? AND codori = ?';
            db.query(query, [update.cantidad_real, update.ter, update.codcli, update.codori], (err, results) => {
                if (err) {
                    return reject(err);
                }
                resolve(results);
            });
        });
    });

    // Ejecutar todas las consultas
    Promise.all(queries)
        .then(results => {
            res.json({ success: true });
        })
        .catch(err => {
            console.error('Error finalizing orders:', err);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        });
});


const port = 3001;
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});
