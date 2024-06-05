const db = require('../config/db');
const { QueryTypes } = require('sequelize');

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
    let error = false;

    //TODO: hacer validaciones server-side

    // Validar que vengan todos los campos necesarios
    ['conductorSelect', 'conductorText', 'tipo'].every((item) => {
        if (!reqJSON.hasOwnProperty(item)) {
            error = true;
        };
        return !error;
    });

    if (error) {
        res.status(400).json({ message: 'error' });
        return;
    }

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

    res.json({ message: 'success' });
};

exports.cargarRankings = async (req, res) => {
    console.log("CARGAR LISTA INGRESO CONDUCTORES!");

    let RankingPropios = await db.n_virginia.query(`
    SELECT * FROM ranking_ingreso_conductores_propios;
    `, {
        type: QueryTypes.SELECT
    });

    let RankingAsociados = await db.n_virginia.query(`
    SELECT * FROM ranking_ingreso_conductores_asociados;
    `, {
        type: QueryTypes.SELECT
    });

    let RankingPorEliminar = await db.n_virginia.query(`
    SELECT * FROM ranking_ingreso_conductores_por_eliminar;
    `, {
        type: QueryTypes.SELECT
    });

    rankingsArray = [RankingPropios, RankingAsociados, RankingPorEliminar];
    dataPropios = RankingPropios;
    dataAsociados = RankingAsociados;
    dataPorEliminar = RankingPorEliminar;

    let rutArray = [];

    rankingsArray.forEach((rankingData) => {
        for (let fila of rankingData) { rutArray.push(fila.usu_rut) }
    });

    if (rutArray.length > 0) {
        let PresentacionesRetiros = await db.data_warehouse.query(`
        WITH datos_filtrados AS (
            SELECT
                conductor.rut,
                conductor.tipo_conductor,
                etapa.codigo,
                tiempo.etapa_1_fecha
            FROM
                public.conductor AS conductor
            LEFT JOIN public.etapa AS etapa ON etapa.id_etapa = conductor.id_conductor
            LEFT JOIN public.caracteristicas AS caracteristicas ON etapa.id_etapa = caracteristicas.id_caracteristicas
            LEFT JOIN public.time AS tiempo ON etapa.id_etapa = tiempo.id_time
            WHERE
                conductor.rut IN (:ruts)
                AND conductor.tipo_conductor IN ('PROPIO', 'ASOCIADO', 'TERCERO')
                AND etapa.codigo IN ('1', '2')
                AND tiempo.etapa_1_fecha >= timestamp with time zone '2024-05-09 00:00:00.000Z'
                AND tiempo.etapa_1_fecha >= CAST((NOW() + INTERVAL '-30 day') AS date)
                AND tiempo.etapa_1_fecha < CAST((NOW() + INTERVAL '1 day') AS date)
        )
        SELECT
            rut,
            tipo_conductor AS tipo,
            COUNT(CASE WHEN codigo = '1' THEN rut END) AS n_retiros_mes,
            COUNT(CASE WHEN codigo = '2' THEN rut END) AS n_presentaciones_mes,
            COUNT(CASE 
                WHEN codigo = '1'
                    AND etapa_1_fecha >= CAST(NOW() AS date)
                    AND etapa_1_fecha < CAST((NOW() + INTERVAL '1 day') AS date)
                THEN rut
            END) AS n_retiros_hoy,
            COUNT(CASE 
                WHEN codigo = '2'
                    AND etapa_1_fecha >= CAST(NOW() AS date)
                    AND etapa_1_fecha < CAST((NOW() + INTERVAL '1 day') AS date)
                THEN rut
            END) AS n_presentaciones_hoy
        FROM
            datos_filtrados
        GROUP BY
            tipo_conductor,
            rut
        ORDER BY
            tipo_conductor ASC,
            rut ASC;
        `,
        {
            replacements: {
                ruts: rutArray
            },
            type: QueryTypes.SELECT
        });

        function presentacionesRetirosHelper(dataArray) {
            // primero revisamos que no es lista vacia o indefinida
            if (typeof dataArray !== 'undefined' && dataArray.length > 0) {    
                for (let fila of dataArray) {
                    let rut = fila.usu_rut;
                    for (let filaN of PresentacionesRetiros) {
                        if (rut === filaN.rut) {
                            fila['n_retiros_mes'] = filaN.n_retiros_mes;
                            fila['n_presentaciones_mes'] = filaN.n_presentaciones_mes;
                            fila['n_retiros_hoy'] = filaN.n_retiros_hoy;
                            fila['n_presentaciones_hoy'] = filaN.n_presentaciones_hoy;
                        }
                    }
                    if (!fila.hasOwnProperty('n_retiros_mes')) {
                        fila['n_retiros_mes'] = 0;
                        fila['n_presentaciones_mes'] = 0;
                        fila['n_retiros_hoy'] = 0;
                        fila['n_presentaciones_hoy'] = 0;
                    }
                }
            }
        }

        rankingsArray.forEach((rankingData) => {
            presentacionesRetirosHelper(rankingData)
        });

    }

    res.json({
        propios: dataPropios,
        asociados: dataAsociados,
        por_eliminar: dataPorEliminar,
    });
};

exports.guardarCambiosMantenedor = async (req, res) => {
    console.log("INICIANDIO SERVERSIDE GUARDAR CAMBIOS MANTENEDOR");
    let reordenadosArray = req.body['reordenados'];
    let marcadosEliminacionArray = req.body['porEliminar'];

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
    
    if (typeof marcadosEliminacionArray !== 'undefined' && marcadosEliminacionArray.length > 0) {
        for (let dataMarcadoEliminacion of marcadosEliminacionArray) {
            console.log(dataMarcadoEliminacion);
            await db.n_virginia.query(`
                UPDATE mantenedor_ingreso_conductores
                    SET por_eliminar = :por_eliminar
                    WHERE fk_ingreso = :fk_ingreso;   
            `,
            {
                replacements: {
                    fk_ingreso: parseInt(dataMarcadoEliminacion['id']),
                    por_eliminar: dataMarcadoEliminacion['por_eliminar'],
                },
                type: QueryTypes.UPDATE
            });
            console.log('ENVIADO');
        }
    }
    console.log("hola");
    // TODO: response en caso de error
    res.json({ response: 'success' });
};

exports.home = async (req, res) => {
    res.render('index', { title: 'Lista de Ingreso Conductores' })
};

exports.mantenedor = async (req, res) => {
    res.render('mantenedor/index', { title: 'Lista de Ingreso Conductores - Mantenedor'})
};

