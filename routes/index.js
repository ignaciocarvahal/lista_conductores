const express = require('express');
const router = express.Router();
app = express();

const listaIngresoConductoresController = require ('../controllers/listaIngresoConductoresController');

module.exports = function(){
    
    router.get('/',
        listaIngresoConductoresController.home
    );

    router.get('/mantenedor',
        listaIngresoConductoresController.mantenedor
    );

    router.get('/conductores',
        listaIngresoConductoresController.cargarConductores
    );

    router.get('/rankings',
        listaIngresoConductoresController.cargarRankings
    );

    router.get('/razones_eliminacion',
        listaIngresoConductoresController.cargarRazonesEliminacion
    );

    router.post('/conductores/add',
        listaIngresoConductoresController.agregarConductorEnListaIngreso
    );

    router.post('/conductores/change',
        listaIngresoConductoresController.guardarCambiosConductor
    );

    return router;
}

