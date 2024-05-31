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

    //TODO: hacer validaciones server-side

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

exports.cargarPresentacionesRetirosMes = async (req, res) => {
    let PresentacionesRetiros30Dias = await db.data_warehouse.query(`
        SELECT
        "public"."etapa"."codigo" AS "codigo",
        "Conductor"."nombre" AS "Conductor__nombre",
        COUNT(*) AS "count"
        FROM
        "public"."etapa"
        LEFT JOIN "public"."conductor" AS "Conductor" ON "public"."etapa"."id_etapa" = "Conductor"."id_conductor"
        LEFT JOIN "public"."caracteristicas" AS "Caracteristicas" ON "public"."etapa"."id_etapa" = "Caracteristicas"."id_caracteristicas"
        LEFT JOIN "public"."time" AS "Time" ON "public"."etapa"."id_etapa" = "Time"."id_time"
        WHERE
        (
            ("Conductor"."tipo_conductor" = 'ASOCIADO')
    
        )
        AND (
            "Time"."etapa_1_fecha" >= CAST((NOW() + INTERVAL '-30 day') AS date)
        )
        AND (
            "Time"."etapa_1_fecha" < CAST((NOW() + INTERVAL '1 day') AS date)
        )
        AND (
            ("public"."etapa"."codigo" = '2')
            OR ("public"."etapa"."codigo" = '1')
        )
        AND (
            "Time"."etapa_1_fecha" >= timestamp with time zone '2024-05-09 00:00:00.000Z'
        )
        GROUP BY
        "public"."etapa"."codigo",
        "Conductor"."nombre"
        ORDER BY
        "public"."etapa"."codigo" ASC,
        "Conductor"."nombre" ASC
    `);

    res.json(PresentacionesRetiros30Dias[0]);
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
                UPDATE mantenedor_ingreso_conductores
                    SET orden = :orden
                    WHERE fk_ingreso = :fk_ingreso;       
            `,
            {
                replacements: {
                    fk_ingreso: parseInt(dataCambio['id']),
                    orden: parseInt(dataCambio['orden']),
                },
                type: QueryTypes.UPDATE
            });
            console.log('ENVIADO');
        }
    }
    
    if (typeof eliminadosArray !== 'undefined' && eliminadosArray.length > 0) {
        for (let dataEliminado of eliminadosArray) {
            console.log(dataEliminado);
            await db.n_virginia.query(`
                UPDATE mantenedor_ingreso_conductores
                    SET eliminado = :eliminado
                    WHERE fk_ingreso = :fk_ingreso;   
            `,
            {
                replacements: {
                    fk_ingreso: parseInt(dataEliminado['id']),
                    eliminado: dataEliminado['eliminado'],
                },
                type: QueryTypes.UPDATE
            });
            console.log('ENVIADO');
        }
    }

    // TODO: response en caso de error
    res.json({ response: 'success' });
};

exports.home = async (req, res) => {
    res.render('index', { title: 'Lista de Ingreso Conductores' })
};

exports.mantenedor = async (req, res) => {
    res.render('mantenedor/index', { title: 'Lista de Ingreso Conductores - Mantenedor'})
};

