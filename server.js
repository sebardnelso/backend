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
    database: 'ausol',
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
            database: 'ausol',
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

// Endpoint para obtener clientes con codemp
app.get('/clientes', (req, res) => {
    const { zona } = req.query;
    
    // Consulta para obtener codcli, fecha, realiza, y el codemp único
    const query = `
        SELECT p.codcli, p.fecha, p.realiza, MAX(f.codemp) AS codemp
        FROM aus_ped p
        JOIN aus_famov f ON p.codcli = f.codcli
        WHERE p.zona = ? AND p.ter != 1
        GROUP BY p.codcli, p.fecha, p.realiza;
    `;

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

    const query = `
        SELECT p.*, a.denom
        FROM aus_ped p
        JOIN aus_art a 
        ON REPLACE(p.codori, '-', ' ') = a.codbar
        WHERE p.codcli = ? AND p.zona = ?
        ORDER BY p.ubicacion ASC;
    `;

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

app.post('/pedidos/finalizar', (req, res) => {
    const updates = req.body.updates;

    // Verificar que updates es un array
    if (!Array.isArray(updates)) {
        return res.status(400).json({ success: false, error: 'Invalid data format' });
    }

    // Construir y ejecutar las consultas de actualización
    const queries = updates.map(update => {
        return new Promise((resolve, reject) => {
            // Solo actualizamos cantidad_real, ter y codbarped, sin modificar codori
            const query = `
                UPDATE aus_ped 
                SET 
                    cantidad_real = ?, 
                    ter = ?, 
                    codbarped = ? 
                WHERE 
                    codcli = ? 
                    AND zona = ? 
                    AND codori = ?`;
            
            db.query(query, [
                update.cantidad_real, 
                update.ter, 
                update.codbarped, 
                update.codcli, 
                update.zona, 
                update.codori
            ], (err, results) => {
                if (err) {
                    console.error('Error al actualizar la base de datos:', err);
                    return reject(err);
                }
                console.log(`Pedido actualizado: codori=${update.codori}, cantidad_real=${update.cantidad_real}, ter=${update.ter}, codbarped=${update.codbarped}`);
                resolve(results);
            });
        });
    });

    // Ejecutar todas las consultas
    Promise.all(queries)
        .then(results => {
            console.log('Todos los pedidos han sido actualizados con éxito.');
            res.json({ success: true });
        })
        .catch(err => {
            console.error('Error al finalizar los pedidos:', err);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        });
});

app.post('/pedidos/updateRealiza', (req, res) => {
    const { codcli, zona, username } = req.body;

    if (!codcli || !zona || !username) {
        return res.status(400).send('Faltan parámetros necesarios');
    }

    // Actualiza los pedidos en la base de datos
    const query = `
        UPDATE aus_ped
        SET realiza = ?
        WHERE codcli = ? AND zona = ? AND ter <> 1
    `;
    
    db.query(query, [username, codcli, zona], (err, results) => {
        if (err) {
            console.error('Error al actualizar los pedidos:', err);
            return res.status(500).send('Error al actualizar los pedidos');
        }

        console.log('Pedidos actualizados:', results.affectedRows);
        res.status(200).send('Pedidos actualizados con éxito');
    });
});


const port = 3001;
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});
