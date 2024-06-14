const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const routes = require('./routes');
const listaIngresoConductoresController = require ('./controllers/listaIngresoConductoresController');

const app = express();
const PORT = 3000;

// Set database connection
const db = require('./config/db');

// Define middleware as needed...
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : true}));

// Set Pug as the view engine
app.set('view engine', 'pug');

// Specify the directory where your .pug files are located
app.set('views', './views');

// Serve css and js files from node_modules
//// Bootstrap (4.6.2)
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')));
//// DataTables (Bootstrap 4)
app.use('/js', express.static(path.join(__dirname, 'node_modules/datatables.net/js')));
app.use('/css', express.static(path.join(__dirname, 'node_modules/datatables.net-bs4/css')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/datatables.net-bs4/js')));
//// jQuery
app.use('/js', express.static(path.join(__dirname, 'node_modules/jquery/dist')));
//// sweetAlert2
app.use('/js', express.static(path.join(__dirname, 'node_modules/sweetalert2/dist/')));
app.use('/css', express.static(path.join(__dirname, 'node_modules/sweetalert2/dist/')));
//// public
app.use(express.static('public'));

// Define a route to render the index page
app.use('/', routes());

// m * s * ms
setInterval(listaIngresoConductoresController.consultarListaCarga, 2 * 60 * 1000);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is listening at http://localhost:${PORT}`);
});