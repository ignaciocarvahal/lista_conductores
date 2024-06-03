const db = require('../config/db');
const { json, QueryTypes, Sequelize } = require('sequelize');

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

    dataPropios = RankingPropios;
    dataAsociados = RankingAsociados;
    dataPorEliminar = RankingPorEliminar;

    console.log(dataPropios);

    let rutArray = [];

    for (let fila of dataPropios) {
        rutArray.push(fila.usu_rut);
    }
    for (let fila of dataAsociados) {
        rutArray.push(fila.usu_rut);
    }
    for (let fila of dataPorEliminar) {
        rutArray.push(fila.usu_rut);
    }

    if (rutArray.length > 0) {
        let PresentacionesRetiros30Dias = await db.data_warehouse.query(`
        SELECT
            conductor.rut AS rut,
            conductor.tipo_conductor AS tipo,
            COUNT(conductor.rut) FILTER (
                WHERE etapa.codigo = '1'
                AND tiempo.etapa_1_fecha >= CAST((NOW() + INTERVAL '-30 day') AS date)
                AND tiempo.etapa_1_fecha < CAST((NOW() + INTERVAL '1 day') AS date)
                AND tiempo.etapa_1_fecha >= timestamp with time zone '2024-05-09 00:00:00.000Z'
            ) AS n_retiros,
            COUNT(conductor.rut) FILTER (
                WHERE etapa.codigo = '2'
                AND tiempo.etapa_1_fecha >= CAST((NOW() + INTERVAL '-30 day') AS date)
                AND tiempo.etapa_1_fecha < CAST((NOW() + INTERVAL '1 day') AS date)
                AND tiempo.etapa_1_fecha >= timestamp with time zone '2024-05-09 00:00:00.000Z'
            ) AS n_presentaciones
        FROM
            public.conductor AS conductor
        LEFT JOIN public.etapa AS etapa ON etapa.id_etapa = conductor.id_conductor
        LEFT JOIN public.caracteristicas AS caracteristicas ON etapa.id_etapa = caracteristicas.id_caracteristicas
        LEFT JOIN public.time AS tiempo ON etapa.id_etapa = tiempo.id_time
        WHERE
            conductor.rut IN (:ruts)
            AND conductor.tipo_conductor IN ('PROPIO', 'ASOCIADO', 'TERCERO')
            AND etapa.codigo IN ('1', '2')
        GROUP BY
            conductor.tipo_conductor,
            conductor.rut
        ORDER BY
            conductor.tipo_conductor ASC,
            conductor.rut ASC
        `,
        {
            replacements: {
                ruts: rutArray
            },
            type: QueryTypes.SELECT
        });

        let PresentacionesRetirosDelDia = await db.data_warehouse.query(`
        SELECT
            conductor.rut AS rut,
            conductor.tipo_conductor AS tipo,
            COUNT(conductor.rut) FILTER (
                WHERE etapa.codigo = '1'
                AND tiempo.etapa_1_fecha >= CAST(NOW() AS date)
                AND tiempo.etapa_1_fecha < CAST((NOW() + INTERVAL '1 day') AS date)
                AND tiempo.etapa_1_fecha >= timestamp with time zone '2024-05-09 00:00:00.000Z'
            ) AS n_retiros,
            COUNT(conductor.rut) FILTER (
                WHERE etapa.codigo = '2'
                AND tiempo.etapa_1_fecha >= CAST(NOW() AS date)
                AND tiempo.etapa_1_fecha < CAST((NOW() + INTERVAL '1 day') AS date)
                AND tiempo.etapa_1_fecha >= timestamp with time zone '2024-05-09 00:00:00.000Z'
            ) AS n_presentaciones
        FROM
            public.conductor AS conductor
        LEFT JOIN public.etapa AS etapa ON etapa.id_etapa = conductor.id_conductor
        LEFT JOIN public.caracteristicas AS caracteristicas ON etapa.id_etapa = caracteristicas.id_caracteristicas
        LEFT JOIN public.time AS tiempo ON etapa.id_etapa = tiempo.id_time
        WHERE
            conductor.rut IN (:ruts)
            AND conductor.tipo_conductor IN ('PROPIO', 'ASOCIADO', 'TERCERO')
            AND etapa.codigo IN ('1', '2')
        GROUP BY
            conductor.tipo_conductor,
            conductor.rut
        ORDER BY
            conductor.tipo_conductor ASC,
            conductor.rut ASC
        `,
        {
            replacements: {
                ruts: rutArray
            },
            type: QueryTypes.SELECT
        });

        if (typeof dataPropios !== 'undefined' && dataPropios.length > 0) {
            for (let fila of dataPropios) {
                let rut = fila.usu_rut;
                for (let filaN of PresentacionesRetiros30Dias) {
                    if (rut === filaN.rut) {
                        fila['n_retiros_mes'] = filaN.n_retiros;
                        fila['n_presentaciones_mes'] = filaN.n_presentaciones;
                    }
                }
                for (let filaN of PresentacionesRetirosDelDia) {
                    if (rut === filaN.rut) {
                        fila['n_retiros_hoy'] = filaN.n_retiros;
                        fila['n_presentaciones_hoy'] = filaN.n_presentaciones;
                    }
                }
            }
        }
        if (typeof dataAsociados !== 'undefined' && dataAsociados.length > 0) {
            for (let fila of dataAsociados) {
                let rut = fila.usu_rut;
                for (let filaN of PresentacionesRetiros30Dias) {
                    if (rut === filaN.rut) {
                        fila['n_retiros_mes'] = filaN.n_retiros;
                        fila['n_presentaciones_mes'] = filaN.n_presentaciones;
                    }
                }
                for (let filaN of PresentacionesRetirosDelDia) {
                    if (rut === filaN.rut) {
                        fila['n_retiros_hoy'] = filaN.n_retiros;
                        fila['n_presentaciones_hoy'] = filaN.n_presentaciones;
                    }
                }
            }
        }
        if (typeof dataPorEliminar !== 'undefined' && dataPorEliminar.length > 0) {
            for (let fila of dataPorEliminar) {
                let rut = fila.usu_rut;
                for (let filaN of PresentacionesRetiros30Dias) {
                    if (rut === filaN.rut) {
                        fila['n_retiros_mes'] = filaN.n_retiros;
                        fila['n_presentaciones_mes'] = filaN.n_presentaciones;
                    }
                }
                for (let filaN of PresentacionesRetirosDelDia) {
                    if (rut === filaN.rut) {
                        fila['n_retiros_hoy'] = filaN.n_retiros;
                        fila['n_presentaciones_hoy'] = filaN.n_presentaciones;
                    }
                }
            }
        }
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

