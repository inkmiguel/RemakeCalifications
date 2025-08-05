export class EvaluacionHistorial {
    id: string = '';
    usuarioId: string = ''; // ID del estudiante evaluado
    profesorId?: string = ''; // ID del profesor que creó la evaluación
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
