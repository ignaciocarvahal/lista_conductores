const db = require('../config/db');
const { json, QueryTypes } = require('sequelize');

exports.cargarConductores = async (req, res) => {
    let Conductores = await db.query(`
    SELECT usu.usu_rut, 
        upper(
            CASE
                WHEN btrim(usu.usu_nombre) LIKE '% %' THEN "left"(btrim(usu.usu_nombre), strpos(btrim(usu.usu_nombre), ' ') - 1)
                ELSE btrim(usu.usu_nombre)
                END || ' ' ||
            CASE
                WHEN btrim(usu.usu_apellido) LIKE '% %' THEN 
                    CASE 
                        WHEN split_part(btrim(usu.usu_apellido), ' ', 2) <> '' THEN
                            concat(split_part(btrim(usu.usu_apellido), ' ', 1), ' ', "left"(split_part(btrim(usu.usu_apellido), ' ', 2), 1))
                        ELSE btrim(usu.usu_apellido)
                        END
                ELSE btrim(usu.usu_apellido)
                END
        ) as nombre, 
        usu.ult_empt_tipo AS tipo FROM usuarios usu WHERE usu.usu_tipo = 2 AND usu.usu_estado = 0;
    `);

    res.json(Conductores[0]);
};

exports.agregarConductorEnListaIngreso = async (req, res) => {
    let reqJSON = req.body;

    //TODO: validar RUT

    if (reqJSON.hasOwnProperty('porteador')) {
        reqJSON['porteador'] = true;
    } else {
        reqJSON['porteador'] = false;
    }

    await db.n_virginia.query(`
    INSERT INTO ingreso_conductores (usu_rut, usu_nombre_completo, tipo, porteador, "createdAt")
        VALUES (:usu_rut, :usu_nombre_completo, :tipo, :porteador, CURRENT_TIMESTAMP)
    `,
    {
        replacements: {
            usu_rut: reqJSON['conductorSelect'],
            usu_nombre_completo: reqJSON['conductorText'],
            tipo: reqJSON['tipo'],
            porteador: reqJSON['porteador'],
        },
        type: QueryTypes.INSERT
    });

    res.json({ test: 'hola' });
};

exports.cargarRankings = async (req, res) => {
    console.log("CARGAR LISTA INGRESO CONDUCTORES!");

    let RankingPropios = await db.n_virginia.query(`
    SELECT * FROM ranking_ingreso_conductores_propios;
    `);

    let RankingAsociados = await db.n_virginia.query(`
    SELECT * FROM ranking_ingreso_conductores_asociados;
    `);

    res.json({
        propios: RankingPropios[0],
        asociados: RankingAsociados[0],
    });
};

exports.guardarCambiosMantenedor = async (req, res) => {
    let reordenadosArray = req.body['reordenados'];
    let eliminadosArray = req.body['eliminados'];

    if (typeof reordenadosArray !== 'undefined' && reordenadosArray.length > 0) {
        for (let dataCambio of reordenadosArray) {
            console.log(dataCambio);
            await db.n_virginia.query(`
                INSERT INTO mantenedor_ingreso_conductores (fk_ingreso, delta_orden, eliminado)
                    VALUES (:fk_ingreso, :delta_orden, false)
                    ON CONFLICT (fk_ingreso) 
                    DO UPDATE SET delta_orden = mantenedor_ingreso_conductores.delta_orden + EXCLUDED.delta_orden;        
            `,
            {
                replacements: {
                    fk_ingreso: parseInt(dataCambio['id']),
                    delta_orden: parseInt(dataCambio['delta_ranking']),
                },
                type: QueryTypes.INSERT
            });
            console.log('ENVIADO');
        }
    }
    
    if (typeof eliminadosArray !== 'undefined' && eliminadosArray.length > 0) {
        for (let dataEliminado of eliminadosArray) {
            console.log(dataEliminado);
            await db.n_virginia.query(`
                INSERT INTO mantenedor_ingreso_conductores (fk_ingreso, delta_orden, eliminado)
                    VALUES (:fk_ingreso, 0, :eliminado)
                    ON CONFLICT (fk_ingreso) 
                    DO UPDATE SET eliminado = EXCLUDED.eliminado;
            `,
            {
                replacements: {
                    fk_ingreso: parseInt(dataEliminado['id']),
                    eliminado: dataEliminado['eliminado'],
                },
                type: QueryTypes.INSERT
            });
            console.log('ENVIADO');
        }
    }

    /*
    let Conductores = await db.query(`
    SELECT usu_rut, UPPER(TRIM(usu_nombre)) || ' ' || UPPER(TRIM(usu_apellido)) AS nombre, ult_empt_tipo AS tipo FROM usuarios WHERE usu_tipo = 2 AND usu_estado = 0;
    `);
    */

    // TODO: answer
    res.json({ response: 'success' });
};

exports.home = async (req, res) => {
    res.render('index', { title: 'Lista de Ingreso Conductores' })
};

exports.mantenedor = async (req, res) => {
    res.render('mantenedor/index', { title: 'Lista de Ingreso Conductores - Mantenedor'})
};

