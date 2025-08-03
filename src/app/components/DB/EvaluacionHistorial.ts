export class EvaluacionHistorial {
    id: string = '';
    usuarioId: string = '';
    fecha: Date = new Date();
    nombre: string = '';
    materia: string = '';
    tipo: string = '';
    resultado: string = '';
    promedio: number = 0;
    tareas?: Array<{
        titulo: string;
        fecha: string;
        descripcion: string;
        calificacion: number;
        ponderacion?: number;
    }> = [];
    examenes?: number[] = [];
    ponderacionTareas?: number;

    constructor() {}
}
