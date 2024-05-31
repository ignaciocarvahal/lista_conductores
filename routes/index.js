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

    router.get('/conductores/presentaciones_retiros_mes',
        listaIngresoConductoresController.cargarPresentacionesRetirosMes
    );

    router.post('/conductores/add',
        listaIngresoConductoresController.agregarConductorEnListaIngreso
    );

    router.post('/mantenedor/cambios',
        listaIngresoConductoresController.guardarCambiosMantenedor
    );

    return router;
}

