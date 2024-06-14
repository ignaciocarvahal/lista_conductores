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
    let cambiosListaCargaArray = [];

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

        let ListaDeCarga = await db.query(`
        SELECT DISTINCT ON (usu.usu_rut)
            usu.usu_rut AS rut

            FROM public.servicios AS ser
            INNER JOIN public.listado_carga_contenedores AS carga on ser.numero_contenedor=carga.contenedor AND ser.id=carga.fk_servicio AND carga.estado IS true
            LEFT JOIN public.servicios_etapas AS eta_2 on ser.id=eta_2.fk_servicio AND eta_2.tipo=2
            LEFT JOIN public.servicios_etapas_conductores AS cond ON eta_2.id=cond.fk_etapa
            LEFT JOIN public.usuarios AS usu ON cond.fk_conductor=usu.usu_rut
            WHERE usu.usu_rut IN (:ruts)
            ORDER BY usu.usu_rut, carga.posicion ASC
        `,
        {
            replacements: {
                ruts: rutArray
            },
            type: QueryTypes.SELECT
        });

        function procesamientoHelper(dataArray) {
            // primero revisamos que no es lista vacia o indefinida
            if (typeof dataArray !== 'undefined' && dataArray.length > 0) {  
                // guardamos los elementos que eliminaremos despues de iterar  
                let eliminarArray = [];

                for (let fila of dataArray) {
                    let rut = fila.usu_rut;

                    // n presentaciones y retiros
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

                    let en_lista = false;
                    let cambio_estado = false;
                    // estado lista de carga
                    for (let conductorListaCarga of ListaDeCarga) {
                        if (rut === conductorListaCarga.rut) {
                            console.log("EN LISTA:", rut);
                            en_lista = true;
                            if (fila['estado_lista_carga'] == 0) {
                                cambio_estado = true;
                                fila['estado_lista_carga'] = 1;
                            }
                        }
                    }

                    // estado_lista_carga:
                    //  0 = no ha estado en lista carga
                    //  1 = esta actualmente en lista carga
                    //  2 = estuvo en lista carga y ya se cargó el contenedor
                    // al pasar a 2 ya no debería aparecer en ranking

                    // si no aparecio en la lista cuando su estado era 1
                    // pasa a 2
                    if (!en_lista && fila['estado_lista_carga'] == 1) {
                        fila['estado_lista_carga'] = 2;
                        cambio_estado = true;
                    }

                    if (cambio_estado) {
                        console.log("CAMBIO ESTADO");
                        cambiosListaCargaArray.push(fila);
                        //ademas eliminar del arreglo (para estado 2), para que no se muestre en la tabla.
                        if(fila['estado_lista_carga'] == 2) {
                            fila.por_eliminar = true;
                            eliminarArray.push(fila);
                        }
                    }
                }

                for (let filaEliminacion of eliminarArray) {
                    const index = dataArray.indexOf(filaEliminacion);
                    if (index !== -1) {
                        dataArray.splice(index, 1);
                    }
                    dataPorEliminar.push(filaEliminacion);
                }
            }
        }

        rankingsArray.forEach((rankingData) => {
            procesamientoHelper(rankingData);
        });
    }

    console.log("------------------------AQUI DEBERIA OCURRIR UPDATE------------------------");
    console.log(cambiosListaCargaArray);
    for (let fila of cambiosListaCargaArray) {

        await db.n_virginia.query(`
        UPDATE mantenedor_ingreso_conductores
            SET estado_lista_carga = :estado_lista_carga, por_eliminar = :por_eliminar
            WHERE id = :id
        `,
        {
            replacements: {
                estado_lista_carga: fila.estado_lista_carga,
                por_eliminar: (fila.estado_lista_carga == 2),
                id: fila.id
            },
            type: QueryTypes.UPDATE
        });
    }

    res.json({
        propios: dataPropios,
        asociados: dataAsociados,
        por_eliminar: dataPorEliminar,
    });
};

exports.cargarRazonesEliminacion = async (req, res) => {
    console.log("--------------------CARGANDO RAZONES ELIMINACION------------------------");
    let RazonesEliminacion = await db.n_virginia.query(`
        SELECT id, razon FROM razones_eliminacion
    `,
    {
        type: QueryTypes.SELECT
    });

    console.log(RazonesEliminacion);

    let razonesResponse = {};
    // TODO: formatear datos en objeto con llaves = valor opcion y valor = texto opcion
    // TODO: caso largo = 0
    for(let fila of RazonesEliminacion) {
        razonesResponse[fila.id] = fila.razon;
    }
    console.log(razonesResponse);
    res.json(razonesResponse);
}

exports.guardarCambiosConductor = async (req, res) => {
    console.log("INICIANDIO GUARDADO CAMBIOS CONDUCTOR");
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
                    SET por_eliminar = :por_eliminar, fk_razon_eliminacion = :fk_razon_eliminacion
                    WHERE fk_ingreso = :fk_ingreso;   
            `,
            {
                replacements: {
                    fk_ingreso: parseInt(dataMarcadoEliminacion['id']),
                    fk_razon_eliminacion: dataMarcadoEliminacion['fk_razon_eliminacion'],
                    por_eliminar: dataMarcadoEliminacion['por_eliminar'],
                },
                type: QueryTypes.UPDATE
            });
            console.log('ENVIADO');
        }
    }

    /* Porteo: uno a la vez */
    let cambioPorteo = req.body['porteo'];

    if (typeof cambioPorteo !== 'undefined') {
        try {
            await db.n_virginia.query(`
                UPDATE ingreso_conductores
                    SET porteador = :porteador
                    WHERE id = :fk_ingreso;   
            `,
            {
                replacements: {
                    fk_ingreso: parseInt(cambioPorteo['id']),
                    porteador: cambioPorteo['porteador'],
                },
                type: QueryTypes.UPDATE
            });
        } catch (error) {
            console.log(error);
        }
    }

    // TODO: response en caso de error
    res.json({ response: 'success' });
};

exports.consultarListaCarga = async function() {
    console.log("CONSULTA LISTA DE CARGA");

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

    rankingsArray = [RankingPropios, RankingAsociados];

    let rutArray = [];
    let cambiosListaCargaArray = [];

    rankingsArray.forEach((rankingData) => {
        for (let fila of rankingData) { rutArray.push(fila.usu_rut) }
    });

    if (rutArray.length > 0) {
        let ListaDeCarga = await db.query(`
        SELECT DISTINCT ON (usu.usu_rut)
            usu.usu_rut AS rut

            FROM public.servicios AS ser
            INNER JOIN public.listado_carga_contenedores AS carga on ser.numero_contenedor=carga.contenedor AND ser.id=carga.fk_servicio AND carga.estado IS true
            LEFT JOIN public.servicios_etapas AS eta_2 on ser.id=eta_2.fk_servicio AND eta_2.tipo=2
            LEFT JOIN public.servicios_etapas_conductores AS cond ON eta_2.id=cond.fk_etapa
            LEFT JOIN public.usuarios AS usu ON cond.fk_conductor=usu.usu_rut
            WHERE usu.usu_rut IN (:ruts)
            ORDER BY usu.usu_rut, carga.posicion ASC
        `,
        {
            replacements: {
                ruts: rutArray
            },
            type: QueryTypes.SELECT
        });

        function procesamientoHelper(dataArray) {
            // primero revisamos que no es lista vacia o indefinida
            if (typeof dataArray !== 'undefined' && dataArray.length > 0) {  
                for (let fila of dataArray) {
                    let rut = fila.usu_rut;
                    let en_lista = false;
                    let cambio_estado = false;
                    // estado lista de carga
                    for (let conductorListaCarga of ListaDeCarga) {
                        if (rut === conductorListaCarga.rut) {
                            en_lista = true;
                            if (fila['estado_lista_carga'] == 0) {
                                cambio_estado = true;
                                fila['estado_lista_carga'] = 1;
                            }
                        }
                    }
                    
                    if (!en_lista && fila['estado_lista_carga'] == 1) {
                        fila['estado_lista_carga'] = 2;
                        cambio_estado = true;
                    }

                    if (cambio_estado) {
                        cambiosListaCargaArray.push(fila);
                    }
                }
            }
        }

        rankingsArray.forEach((rankingData) => {
            procesamientoHelper(rankingData);
        });
    }

    for (let fila of cambiosListaCargaArray) {
        await db.n_virginia.query(`
        UPDATE mantenedor_ingreso_conductores
            SET estado_lista_carga = :estado_lista_carga, por_eliminar = :por_eliminar
            WHERE id = :id
        `,
        {
            replacements: {
                estado_lista_carga: fila.estado_lista_carga,
                por_eliminar: (fila.estado_lista_carga == 2),
                id: fila.id
            },
            type: QueryTypes.UPDATE
        });
    }
};

exports.home = async (req, res) => {
    res.render('index', { title: 'Lista de Ingreso Conductores' })
};

exports.mantenedor = async (req, res) => {
    res.render('mantenedor/index', { title: 'Lista de Ingreso Conductores - Mantenedor'})
};

