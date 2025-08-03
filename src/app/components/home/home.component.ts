import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ChartOptions, ChartData, ChartType } from 'chart.js';
import { AuthService } from '../../services/auth.service';
import { Usuario, EvaluacionHistorial } from '../DB';
import { Firestore, collection, addDoc, query, where, collectionData, orderBy, doc, deleteDoc, updateDoc } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  usuarioLogueado = false;
  usuarioActual: Usuario | null = null;
  private authSubscription?: Subscription;
  historial: EvaluacionHistorial[] = [];
  
  // Variables para edición
  modoEdicion = false;
  evaluacionEditando: EvaluacionHistorial | null = null;

  // Variables para autocompletado de materias
  materiasDisponibles: string[] = [];
  materiasFiltradas: string[] = [];
  mostrarSugerenciasMaterias = false;
  
  // Variables para tareas previas de la materia
  tareasPreviasMaterias: { [materia: string]: Array<{titulo: string, descripcion: string}> } = {};
  
  // Variable para mostrar información de evaluación existente
  evaluacionExistenteInfo: EvaluacionHistorial | null = null;

  constructor(private router: Router, private authService: AuthService, private firestore: Firestore) { 
    this.historialCollection = collection(this.firestore, 'evaluaciones');
  }

  ngOnInit() {
    // Suscribirse al estado de autenticación
    this.authSubscription = this.authService.usuarioLogueado$.subscribe(usuario => {
      this.usuarioLogueado = !!usuario;
      this.usuarioActual = usuario;
      
      if (usuario) {
        this.cargarHistorial();
      } else {
        this.historial = [];
      }
    });
  }

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  historialCollection = collection(this.firestore, 'evaluaciones');

  cargarHistorial() {
    if (!this.usuarioActual) return;
    
    const historialQuery = query(
      this.historialCollection,
      where('usuarioId', '==', this.usuarioActual.id)
    );
    
    collectionData(historialQuery, { idField: 'id' }).subscribe((data: any[]) => {
      this.historial = data.map(item => ({
        ...item,
        fecha: item.fecha?.toDate ? item.fecha.toDate() : new Date(item.fecha)
      })).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()); // Ordenar en el cliente
      
      // Extraer materias únicas para autocompletado
      this.extraerMateriasYTareas();
    });
  }

  private extraerMateriasYTareas() {
    const materiasSet = new Set<string>();
    this.tareasPreviasMaterias = {};
    
    this.historial.forEach(evaluacion => {
      if (evaluacion.materia && evaluacion.materia.trim()) {
        const materiaKey = evaluacion.materia.toLowerCase().trim();
        materiasSet.add(evaluacion.materia);
        
        // Agrupar tareas por materia
        if (!this.tareasPreviasMaterias[materiaKey]) {
          this.tareasPreviasMaterias[materiaKey] = [];
        }
        
        if (evaluacion.tareas && evaluacion.tareas.length > 0) {
          evaluacion.tareas.forEach(tarea => {
            // Evitar duplicados basándose en el título
            const yaExiste = this.tareasPreviasMaterias[materiaKey].some(
              t => t.titulo.toLowerCase() === tarea.titulo.toLowerCase()
            );
            
            if (!yaExiste && tarea.titulo && tarea.titulo.trim()) {
              this.tareasPreviasMaterias[materiaKey].push({
                titulo: tarea.titulo,
                descripcion: tarea.descripcion || ''
              });
            }
          });
        }
      }
    });
    
    this.materiasDisponibles = Array.from(materiasSet).sort();
  }

  async guardarEvaluacion(promedio: number, resultadoTexto: string) {
    if (!this.usuarioActual) return;

    // Verificar si ya existe una evaluación de la misma materia y tipo
    const evaluacionExistente = this.historial.find(evaluacion => 
      evaluacion.materia.toLowerCase().trim() === this.materia.toLowerCase().trim() &&
      evaluacion.tipo === this.tipo &&
      evaluacion.usuarioId === this.usuarioActual!.id
    );

    if (evaluacionExistente && !this.modoEdicion) {
      // Mostrar confirmación para actualizar o crear nueva
      const actualizar = confirm(
        `Ya existe una evaluación de "${this.materia}" del tipo "${this.getTipoDisplay(this.tipo)}".\n\n` +
        `¿Deseas actualizar la evaluación existente agregando estas nuevas tareas?\n\n` +
        `• Sí: Las nuevas tareas se agregarán a la evaluación existente\n` +
        `• No: Se creará una nueva evaluación separada`
      );

      if (actualizar) {
        await this.actualizarEvaluacionExistente(evaluacionExistente, promedio, resultadoTexto);
        return;
      }
    }

    // Crear nueva evaluación (comportamiento original)
    const evaluacion = new EvaluacionHistorial();
    evaluacion.usuarioId = this.usuarioActual.id;
    evaluacion.fecha = new Date();
    evaluacion.nombre = this.nombre;
    evaluacion.materia = this.materia;
    evaluacion.tipo = this.tipo;
    evaluacion.resultado = resultadoTexto;
    evaluacion.promedio = promedio;
    
    // Guardar tareas con datos completos
    if (this.tipo === 'tareas' || this.tipo === 'tareas_examen') {
      evaluacion.tareas = this.calificaciones.map((cal, i) => ({
        titulo: this.titulosTareas[i] || `Tarea ${i + 1}`,
        fecha: this.fechasTareas[i] || '',
        descripcion: this.descripcionesTareas[i] || '',
        calificacion: cal || 0
      })).filter(tarea => tarea.calificacion > 0);
    }
    
    // Guardar exámenes
    if (this.tipo === 'tareas_examen' || this.tipo === 'examen') {
      evaluacion.examenes = this.calExamenes.filter((ex): ex is number => ex != null && ex > 0);
    }
    
    // Guardar ponderación
    if (this.tipo === 'tareas_examen') {
      evaluacion.ponderacionTareas = this.ponderacionTareas;
    }

    try {
      await addDoc(this.historialCollection, {
        ...evaluacion,
        fecha: evaluacion.fecha // Firestore manejará la conversión automáticamente
      });
      this.cargarHistorial(); // Recargar el historial
    } catch (error) {
      console.error('Error al guardar la evaluación:', error);
    }
  }

  private async actualizarEvaluacionExistente(evaluacionExistente: EvaluacionHistorial, promedio: number, resultadoTexto: string) {
    try {
      // Crear copias de las tareas y exámenes existentes
      let tareasActualizadas = [...(evaluacionExistente.tareas || [])];
      let examenesActualizados = [...(evaluacionExistente.examenes || [])];

      // Agregar nuevas tareas
      if (this.tipo === 'tareas' || this.tipo === 'tareas_examen') {
        const nuevasTareas = this.calificaciones.map((cal, i) => ({
          titulo: this.titulosTareas[i] || `Tarea ${tareasActualizadas.length + i + 1}`,
          fecha: this.fechasTareas[i] || '',
          descripcion: this.descripcionesTareas[i] || '',
          calificacion: cal || 0
        })).filter(tarea => tarea.calificacion > 0);

        tareasActualizadas = [...tareasActualizadas, ...nuevasTareas];
      }

      // Agregar nuevos exámenes
      if (this.tipo === 'tareas_examen' || this.tipo === 'examen') {
        const nuevosExamenes = this.calExamenes.filter((ex): ex is number => ex != null && ex > 0);
        examenesActualizados = [...examenesActualizados, ...nuevosExamenes];
      }

      // Recalcular el promedio con todas las tareas y exámenes
      let nuevoPromedio = 0;
      if (this.tipo === 'tareas') {
        if (tareasActualizadas.length > 0) {
          nuevoPromedio = tareasActualizadas.reduce((sum, tarea) => sum + tarea.calificacion, 0) / tareasActualizadas.length;
        }
      } else if (this.tipo === 'tareas_examen') {
        if (tareasActualizadas.length > 0 && examenesActualizados.length > 0) {
          const promedioTareas = tareasActualizadas.reduce((sum, tarea) => sum + tarea.calificacion, 0) / tareasActualizadas.length;
          const promedioExamenes = examenesActualizados.reduce((sum, ex) => sum + ex, 0) / examenesActualizados.length;
          nuevoPromedio = promedioTareas * this.ponderacionTareas + promedioExamenes * (1 - this.ponderacionTareas);
        } else if (examenesActualizados.length > 0) {
          nuevoPromedio = examenesActualizados.reduce((sum, ex) => sum + ex, 0) / examenesActualizados.length;
        } else if (tareasActualizadas.length > 0) {
          nuevoPromedio = tareasActualizadas.reduce((sum, tarea) => sum + tarea.calificacion, 0) / tareasActualizadas.length;
        }
      } else if (this.tipo === 'examen') {
        if (examenesActualizados.length > 0) {
          nuevoPromedio = examenesActualizados.reduce((sum, ex) => sum + ex, 0) / examenesActualizados.length;
        }
      }

      // Generar nuevo texto de resultado
      const nuevoResultadoTexto = nuevoPromedio >= 6 
        ? `¡Felicidades ${this.nombre}! Estás aprobando con promedio ${nuevoPromedio.toFixed(2)}.`
        : `Lo siento ${this.nombre}, estás reprobando con promedio ${nuevoPromedio.toFixed(2)}.`;

      // Actualizar la evaluación existente
      const datosActualizados: any = {
        tareas: tareasActualizadas,
        examenes: examenesActualizados,
        promedio: nuevoPromedio,
        resultado: nuevoResultadoTexto,
        fecha: new Date() // Actualizar la fecha también
      };

      // Actualizar ponderación si corresponde
      if (this.tipo === 'tareas_examen') {
        datosActualizados.ponderacionTareas = this.ponderacionTareas;
      }

      const docRef = doc(this.firestore, 'evaluaciones', evaluacionExistente.id!);
      await updateDoc(docRef, datosActualizados);
      
      this.cargarHistorial();
      alert(`Evaluación de "${this.materia}" actualizada exitosamente.\nNuevo promedio: ${nuevoPromedio.toFixed(2)}`);
      
    } catch (error) {
      console.error('Error al actualizar la evaluación existente:', error);
      alert('Error al actualizar la evaluación existente');
    }
  }
  nombre = '';
  materia = '';
  tipo = 'tareas'; // 'tareas', 'tareas_examen', 'examen' - Valor por defecto
  calificaciones: (number | null)[] = [null];
  calExamenes: (number | null)[] = [null];
  ponderacionTareas: number = 0.4; // Por defecto 40% tareas, 60% examen

  // Nuevos arrays para datos adicionales de las tareas
  titulosTareas: string[] = [''];
  fechasTareas: string[] = [''];
  descripcionesTareas: string[] = [''];

  mostrarResultado = false;
  resultadoTexto = '';
  resultadoClase = '';

  // Configuración para la gráfica de barras
  public barChartOptions: ChartOptions = {
    responsive: true,
    plugins: {
      tooltip: {
        callbacks: {
          title: (context) => {
            const index = context[0].dataIndex;
            // Obtener el número de tareas válidas para determinar si es tarea o examen
            const tareasValidas = this.calificaciones.filter((cal): cal is number => cal != null && cal > 0);
            
            if (index < tareasValidas.length) {
              // Es una tarea
              const tareaIndex = this.calificaciones.findIndex((cal, i) => {
                const validasAntes = this.calificaciones.slice(0, i).filter((c): c is number => c != null && c > 0).length;
                return cal != null && cal > 0 && validasAntes === index;
              });
              return this.titulosTareas[tareaIndex] || `Tarea ${index + 1}`;
            } else {
              // Es un examen
              const examenIndex = index - tareasValidas.length;
              return `Examen ${examenIndex + 1}`;
            }
          },
          label: (context) => {
            return `Calificación: ${context.parsed.y}`;
          }
        }
      }
    }
  };
  public barChartLabels: string[] = [];
  public barChartType: ChartType = 'bar';
  public barChartLegend = true;
  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        label: 'Calificaciones',
        data: [],
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
      },
    ],
  };

    get calificacionesHabilitadas(): boolean {
    return this.tipo !== '';
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }
  agregarCalificacion(): void {
    this.calificaciones.push(null);
    this.titulosTareas.push('');
    this.fechasTareas.push('');
    this.descripcionesTareas.push('');
    
    // Forzar la detección de cambios para que los nuevos campos aparezcan en blanco
    setTimeout(() => {
      const newIndex = this.calificaciones.length - 1;
      const tituloInput = document.querySelector(`input[name="titulo${newIndex}"]`) as HTMLInputElement;
      const fechaInput = document.querySelector(`input[name="fecha${newIndex}"]`) as HTMLInputElement;
      const descripcionTextarea = document.querySelector(`textarea[name="descripcion${newIndex}"]`) as HTMLTextAreaElement;
      const calInput = document.querySelector(`input[name="cal${newIndex}"]`) as HTMLInputElement;
      
      if (tituloInput) tituloInput.value = '';
      if (fechaInput) fechaInput.value = '';
      if (descripcionTextarea) descripcionTextarea.value = '';
      if (calInput) calInput.value = '';
    }, 10);
  }

  agregarExamen(): void {
    this.calExamenes.push(null);
    
    // Forzar que el nuevo campo aparezca en blanco
    setTimeout(() => {
      const newIndex = this.calExamenes.length - 1;
      const examenInput = document.querySelector(`input[name="examen${newIndex}"]`) as HTMLInputElement;
      if (examenInput) examenInput.value = '';
    }, 10);
  }

  eliminarExamen(index: number): void {
    if (this.calExamenes.length > 1) {
      this.calExamenes.splice(index, 1);
    }
  }

  eliminarCalificacion(index: number): void {
    // No permitir eliminar si solo queda una calificación
    if (this.calificaciones.length > 1) {
      this.calificaciones.splice(index, 1);
      this.titulosTareas.splice(index, 1);
      this.fechasTareas.splice(index, 1);
      this.descripcionesTareas.splice(index, 1);
    }
  }

  actualizarCalificacion(index: number, inputElement: EventTarget | null): void {
    const input = inputElement as HTMLInputElement;
    let valor = parseFloat(input.value);

    if (isNaN(valor) || valor < 0) valor = 0;
    if (valor > 10) valor = 10;

    this.calificaciones[index] = valor;
    
    // Si es el último campo y tiene un valor, agregar un nuevo campo
    if (index === this.calificaciones.length - 1 && valor > 0) {
      this.agregarCalificacion();
    }
  }

  onCalificacionChange(index: number, event: any): void {
    const inputValue = event.target.value;
    // Si el campo está vacío, asignar null
    if (inputValue === '' || inputValue === null) {
      this.calificaciones[index] = null as any;
      return;
    }
    const valor = parseFloat(inputValue);
    // Solo aceptar valores entre 0 y 100 sin interferir con el foco
    if (!isNaN(valor) && valor >= 0 && valor <= 100) {
      this.calificaciones[index] = valor;
    } else if (valor > 100) {
      // Si el valor es mayor a 100, lo limitamos a 100 pero mantenemos el foco
      event.target.value = '100';
      this.calificaciones[index] = 100;
    }
  }

  onCalificacionKeyDown(index: number, event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement;
    
    if (event.key === 'Enter') {
      event.preventDefault();
      const valor = parseFloat(inputElement.value);
      
      // Actualizar el valor en el array
      this.calificaciones[index] = isNaN(valor) ? null : valor;
      
      // Solo generar nuevo campo si hay un valor válido, es el último campo Y presionamos Enter
      if (!isNaN(valor) && valor > 0 && index === this.calificaciones.length - 1) {
        this.agregarCalificacion();
        
        // Enfocar el siguiente campo después de un pequeño delay
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="cal${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
          }
        }, 100);
      } else if (!isNaN(valor) && valor > 0 && index < this.calificaciones.length - 1) {
        // Si no es el último campo, simplemente enfocar el siguiente
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="cal${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
          }
        }, 100);
      }
    }
    // Para cualquier otra tecla, solo actualizar el valor sin perder foco
    else if (!isNaN(parseFloat(inputElement.value))) {
      // Actualizar el valor en tiempo real pero sin interrumpir la escritura
      setTimeout(() => {
        const valor = parseFloat(inputElement.value);
        this.calificaciones[index] = isNaN(valor) ? null : valor;
      }, 0);
    }
  }

  onCalificacionInput(index: number, event: any): void {
    const inputElement = event.target as HTMLInputElement;
    const valor = parseFloat(inputElement.value);
    
    // Actualizar el valor sin interferir con el foco
    this.calificaciones[index] = isNaN(valor) ? null : valor;
  }

  onCalificacionKeyUp(index: number, event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement;
    
    // Solo cuando se presiona Enter
    if (event.key === 'Enter') {
      event.preventDefault();
      const valor = parseFloat(inputElement.value);
      
      // Primero actualizar el valor en el array del campo actual
      this.calificaciones[index] = isNaN(valor) || inputElement.value === '' ? null : valor;
      
      // Solo generar nuevo campo si hay un valor válido, es el último campo Y presionamos Enter
      if (!isNaN(valor) && valor > 0 && index === this.calificaciones.length - 1) {
        this.agregarCalificacion();
        
        // Enfocar el siguiente campo después de un pequeño delay
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="cal${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
            // Asegurar que el campo esté vacío
            nextInput.value = '';
          }
        }, 50);
      } else if (!isNaN(valor) && valor > 0 && index < this.calificaciones.length - 1) {
        // Si no es el último campo, simplemente enfocar el siguiente
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="cal${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
      }
    }
    // Para cualquier otra tecla, NO hacer nada para evitar interferencia
  }

  onCalificacionBlur(index: number, event: any): void {
    const inputElement = event.target as HTMLInputElement;
    const valor = parseFloat(inputElement.value);
    
    // Actualizar el valor en el array cuando el campo pierde el foco
    this.calificaciones[index] = isNaN(valor) || inputElement.value === '' ? null : valor;
  }

  onExamenChange(index: number, event: any): void {
    const inputValue = event.target.value;
    if (inputValue === '' || inputValue === null) {
      this.calExamenes[index] = null as any;
      return;
    }
    const valor = parseFloat(inputValue);
    // Solo aceptar valores entre 0 y 100 sin interferir con el foco
    if (!isNaN(valor) && valor >= 0 && valor <= 100) {
      this.calExamenes[index] = valor;
    } else if (valor > 100) {
      // Si el valor es mayor a 100, lo limitamos a 100 pero mantenemos el foco
      event.target.value = '100';
      this.calExamenes[index] = 100;
    }
  }

  onExamenKeyDown(index: number, event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement;
    
    if (event.key === 'Enter') {
      event.preventDefault();
      const valor = parseFloat(inputElement.value);
      
      // Actualizar el valor en el array
      this.calExamenes[index] = isNaN(valor) ? null : valor;
      
      // Solo generar nuevo campo si hay un valor válido, es el último campo Y presionamos Enter
      if (!isNaN(valor) && valor > 0 && index === this.calExamenes.length - 1) {
        this.agregarExamen();
        
        // Enfocar el siguiente campo después de un pequeño delay
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="examen${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
          }
        }, 100);
      } else if (!isNaN(valor) && valor > 0 && index < this.calExamenes.length - 1) {
        // Si no es el último campo, simplemente enfocar el siguiente
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="examen${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
          }
        }, 100);
      }
    }
    // Para cualquier otra tecla, solo actualizar el valor sin perder foco
    else if (!isNaN(parseFloat(inputElement.value))) {
      setTimeout(() => {
        const valor = parseFloat(inputElement.value);
        this.calExamenes[index] = isNaN(valor) ? null : valor;
      }, 0);
    }
  }

  onExamenInput(index: number, event: any): void {
    const inputElement = event.target as HTMLInputElement;
    const valor = parseFloat(inputElement.value);
    
    // Actualizar el valor sin interferir con el foco
    this.calExamenes[index] = isNaN(valor) ? null : valor;
  }

  onExamenKeyUp(index: number, event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement;
    
    // Solo cuando se presiona Enter
    if (event.key === 'Enter') {
      event.preventDefault();
      const valor = parseFloat(inputElement.value);
      
      // Primero actualizar el valor en el array del campo actual
      this.calExamenes[index] = isNaN(valor) || inputElement.value === '' ? null : valor;
      
      // Solo generar nuevo campo si hay un valor válido, es el último campo Y presionamos Enter
      if (!isNaN(valor) && valor > 0 && index === this.calExamenes.length - 1) {
        this.agregarExamen();
        
        // Enfocar el siguiente campo después de un pequeño delay
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="examen${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
            // Asegurar que el campo esté vacío
            nextInput.value = '';
          }
        }, 50);
      } else if (!isNaN(valor) && valor > 0 && index < this.calExamenes.length - 1) {
        // Si no es el último campo, simplemente enfocar el siguiente
        setTimeout(() => {
          const nextInput = document.querySelector(`input[name="examen${index + 1}"]`) as HTMLInputElement;
          if (nextInput) {
            nextInput.focus();
          }
        }, 50);
      }
    }
    // Para cualquier otra tecla, NO hacer nada para evitar interferencia
  }

  onExamenBlur(index: number, event: any): void {
    const inputElement = event.target as HTMLInputElement;
    const valor = parseFloat(inputElement.value);
    
    // Actualizar el valor en el array cuando el campo pierde el foco
    this.calExamenes[index] = isNaN(valor) || inputElement.value === '' ? null : valor;
  }


  evaluar(): void {
    // Filtrar solo las calificaciones válidas (no vacías, no nulas, y mayores a 0)
    const calificacionesValidas = this.calificaciones.filter((cal): cal is number => cal != null && cal > 0);
    const examenesValidos = this.calExamenes.filter((ex): ex is number => ex != null && ex > 0);

    // Crear etiquetas solo para las calificaciones válidas
    this.barChartLabels = [
      ...calificacionesValidas.map((_, i) => `Tarea ${i + 1}`),
      ...examenesValidos.map((_, i) => `Examen ${i + 1}`)
    ];

    // Preparar datos para la gráfica solo con calificaciones válidas
    let datosGrafica: number[] = [...calificacionesValidas, ...examenesValidos];

    // Actualizar barChartData creando un nuevo objeto para detectar cambios
    this.barChartData = {
      labels: [...this.barChartLabels],
      datasets: [
        {
          label: 'Calificaciones',
          data: [...datosGrafica],
          backgroundColor: 'rgba(54, 162, 235, 0.7)',
        }
      ]
    };

    // Cálculo del promedio ponderado simple
    let promedio = 0;
    if (this.tipo === 'tareas') {
      if (calificacionesValidas.length > 0) {
        promedio = calificacionesValidas.reduce((a, b) => a + b, 0) / calificacionesValidas.length;
      }
    } else if (this.tipo === 'tareas_examen') {
      if (calificacionesValidas.length > 0 && examenesValidos.length > 0) {
        let tareas = calificacionesValidas.reduce((a, b) => a + b, 0) / calificacionesValidas.length;
        let examen = examenesValidos.reduce((a, b) => a + b, 0) / examenesValidos.length;
        promedio = tareas * this.ponderacionTareas + examen * (1 - this.ponderacionTareas);
      } else if (examenesValidos.length > 0) {
        promedio = examenesValidos.reduce((a, b) => a + b, 0) / examenesValidos.length;
      } else if (calificacionesValidas.length > 0) {
        promedio = calificacionesValidas.reduce((a, b) => a + b, 0) / calificacionesValidas.length;
      }
    } else if (this.tipo === 'examen') {
      if (examenesValidos.length > 0) {
        promedio = examenesValidos.reduce((a, b) => a + b, 0) / examenesValidos.length;
      }
    }

    // Validar que hay calificaciones para evaluar
    if (this.tipo === 'tareas' && calificacionesValidas.length === 0) {
      this.resultadoTexto = 'Por favor ingresa al menos una calificación válida para las tareas.';
      this.resultadoClase = 'alert alert-warning';
      this.mostrarResultado = true;
      return;
    }
    
    if (this.tipo === 'tareas_examen' && calificacionesValidas.length === 0 && examenesValidos.length === 0) {
      this.resultadoTexto = 'Por favor ingresa al menos una calificación de tarea o de examen.';
      this.resultadoClase = 'alert alert-warning';
      this.mostrarResultado = true;
      return;
    }

    if (this.tipo === 'examen' && examenesValidos.length === 0) {
      this.resultadoTexto = 'Por favor ingresa al menos una calificación de examen.';
      this.resultadoClase = 'alert alert-warning';
      this.mostrarResultado = true;
      return;
    }

    if (promedio >= 6) {
      this.resultadoTexto = `¡Felicidades ${this.nombre}! Estás aprobando con promedio ${promedio.toFixed(2)}.`;
      this.resultadoClase = 'alert alert-success';
    } else {
      this.resultadoTexto = `Lo siento ${this.nombre}, estás reprobando con promedio ${promedio.toFixed(2)}.`;
      this.resultadoClase = 'alert alert-danger';
    }

    this.mostrarResultado = true;
    
    // Guardar en el historial si el usuario está logueado y no está en modo edición
    if (this.usuarioLogueado && this.usuarioActual && !this.modoEdicion) {
      this.guardarEvaluacion(promedio, this.resultadoTexto);
    }
  }


  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  irALogin() {
    this.router.navigate(['/login']);
  }

  getTipoDisplay(tipo: string): string {
    switch(tipo) {
      case 'tareas': return 'Solo tareas';
      case 'tareas_examen': return 'Tareas + Examen';
      case 'examen': return 'Solo examen';
      default: return tipo;
    }
  }

  getPromedioClass(promedio: number): string {
    return promedio >= 6 ? 'text-success fw-bold' : 'text-danger fw-bold';
  }

  async eliminarEvaluacion(id: string) {
    if (confirm('¿Estás seguro de que quieres eliminar esta evaluación?')) {
      try {
        const docRef = doc(this.firestore, 'evaluaciones', id);
        await deleteDoc(docRef);
        this.cargarHistorial(); // Recargar el historial
      } catch (error) {
        console.error('Error al eliminar la evaluación:', error);
        alert('Error al eliminar la evaluación');
      }
    }
  }

  editarEvaluacion(evaluacion: EvaluacionHistorial) {
    this.modoEdicion = true;
    this.evaluacionEditando = evaluacion;
    
    // Cargar los datos en el formulario
    this.nombre = evaluacion.nombre || '';
    this.materia = evaluacion.materia || '';
    this.tipo = evaluacion.tipo || 'tareas';
    
    // Limpiar arrays primero
    this.calificaciones = [];
    this.titulosTareas = [];
    this.fechasTareas = [];
    this.descripcionesTareas = [];
    this.calExamenes = [];
    
    // Cargar tareas si existen
    if (evaluacion.tareas && evaluacion.tareas.length > 0) {
      evaluacion.tareas.forEach(tarea => {
        this.calificaciones.push(tarea.calificacion);
        this.titulosTareas.push(tarea.titulo || '');
        this.fechasTareas.push(tarea.fecha || '');
        this.descripcionesTareas.push(tarea.descripcion || '');
      });
    } else {
      // Asegurar al menos un campo vacío
      this.calificaciones.push(null);
      this.titulosTareas.push('');
      this.fechasTareas.push('');
      this.descripcionesTareas.push('');
    }
    
    // Cargar exámenes si existen
    if (evaluacion.examenes && evaluacion.examenes.length > 0) {
      this.calExamenes = [...evaluacion.examenes];
    } else {
      // Asegurar al menos un campo vacío
      this.calExamenes = [null];
    }
    
    // Cargar ponderación si existe
    if (evaluacion.ponderacionTareas !== undefined) {
      this.ponderacionTareas = evaluacion.ponderacionTareas;
    }
    
    // Limpiar variables de autocompletado cuando se edita
    this.mostrarSugerenciasMaterias = false;
    this.mostrarTareasPrevias = false;
    this.evaluacionExistenteInfo = null;
    
    // Scroll al formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion() {
    this.modoEdicion = false;
    this.evaluacionEditando = null;
    this.limpiarFormulario();
  }

  async actualizarEvaluacion() {
    if (!this.evaluacionEditando || !this.evaluacionEditando.id) return;

    // Recalcular el promedio con los nuevos datos
    const calificacionesValidas = this.calificaciones.filter((cal): cal is number => cal != null && cal > 0);
    const examenesValidos = this.calExamenes.filter((ex): ex is number => ex != null && ex > 0);

    let promedio = 0;
    let resultadoTexto = '';

    if (this.tipo === 'tareas') {
      if (calificacionesValidas.length > 0) {
        promedio = calificacionesValidas.reduce((a, b) => a + b, 0) / calificacionesValidas.length;
      }
    } else if (this.tipo === 'tareas_examen') {
      if (calificacionesValidas.length > 0 && examenesValidos.length > 0) {
        let tareas = calificacionesValidas.reduce((a, b) => a + b, 0) / calificacionesValidas.length;
        let examen = examenesValidos.reduce((a, b) => a + b, 0) / examenesValidos.length;
        promedio = tareas * this.ponderacionTareas + examen * (1 - this.ponderacionTareas);
      } else if (examenesValidos.length > 0) {
        promedio = examenesValidos.reduce((a, b) => a + b, 0) / examenesValidos.length;
      } else if (calificacionesValidas.length > 0) {
        promedio = calificacionesValidas.reduce((a, b) => a + b, 0) / calificacionesValidas.length;
      }
    } else if (this.tipo === 'examen') {
      if (examenesValidos.length > 0) {
        promedio = examenesValidos.reduce((a, b) => a + b, 0) / examenesValidos.length;
      }
    }

    if (promedio >= 6) {
      resultadoTexto = `¡Felicidades ${this.nombre}! Estás aprobando con promedio ${promedio.toFixed(2)}.`;
    } else {
      resultadoTexto = `Lo siento ${this.nombre}, estás reprobando con promedio ${promedio.toFixed(2)}.`;
    }

    const datosActualizados: any = {
      nombre: this.nombre,
      materia: this.materia,
      tipo: this.tipo,
      promedio: promedio,
      resultado: resultadoTexto
    };

    // Actualizar tareas si corresponde
    if (this.tipo === 'tareas' || this.tipo === 'tareas_examen') {
      datosActualizados.tareas = this.calificaciones.map((cal, i) => ({
        titulo: this.titulosTareas[i] || `Tarea ${i + 1}`,
        fecha: this.fechasTareas[i] || '',
        descripcion: this.descripcionesTareas[i] || '',
        calificacion: cal || 0
      })).filter(tarea => tarea.calificacion > 0);
    }

    // Actualizar exámenes si corresponde
    if (this.tipo === 'tareas_examen' || this.tipo === 'examen') {
      datosActualizados.examenes = this.calExamenes.filter((ex): ex is number => ex != null && ex > 0);
    }

    // Actualizar ponderación si corresponde
    if (this.tipo === 'tareas_examen') {
      datosActualizados.ponderacionTareas = this.ponderacionTareas;
    }

    try {
      const docRef = doc(this.firestore, 'evaluaciones', this.evaluacionEditando.id);
      await updateDoc(docRef, datosActualizados);
      
      this.cancelarEdicion();
      this.cargarHistorial();
      
      alert('Evaluación actualizada correctamente');
    } catch (error) {
      console.error('Error al actualizar la evaluación:', error);
      alert('Error al actualizar la evaluación');
    }
  }

  private limpiarFormulario() {
    this.nombre = '';
    this.materia = '';
    this.tipo = 'tareas';
    this.calificaciones = [null];
    this.calExamenes = [null];
    this.ponderacionTareas = 0.4;
    this.titulosTareas = [''];
    this.fechasTareas = [''];
    this.descripcionesTareas = [''];
    this.mostrarResultado = false;
    this.resultadoTexto = '';
    this.resultadoClase = '';
    
    // Limpiar variables de autocompletado
    this.mostrarSugerenciasMaterias = false;
    this.mostrarTareasPrevias = false;
    this.materiasFiltradas = [];
    this.tareasPreviasDisponibles = [];
    this.evaluacionExistenteInfo = null;
  }

  // Función helper para obtener un resumen de las tareas
  getTareasResumen(evaluacion: EvaluacionHistorial): string {
    if (!evaluacion.tareas || evaluacion.tareas.length === 0) {
      return 'Sin tareas registradas';
    }
    
    const resumen = evaluacion.tareas.map(tarea => 
      `${tarea.titulo || 'Sin título'}: ${tarea.calificacion}`
    ).join(' | ');
    
    return resumen.length > 50 ? resumen.substring(0, 50) + '...' : resumen;
  }

  // Función helper para obtener un resumen de los exámenes
  getExamenesResumen(evaluacion: EvaluacionHistorial): string {
    if (!evaluacion.examenes || evaluacion.examenes.length === 0) {
      return 'Sin exámenes registrados';
    }
    
    return evaluacion.examenes.map((examen, index) => 
      `Examen ${index + 1}: ${examen}`
    ).join(' | ');
  }

  // Métodos para autocompletado de materias
  onMateriaInput(event: any) {
    const valor = event.target.value;
    this.materia = valor;
    
    if (valor && valor.length > 0) {
      this.materiasFiltradas = this.materiasDisponibles.filter(m => 
        m.toLowerCase().includes(valor.toLowerCase())
      );
      this.mostrarSugerenciasMaterias = this.materiasFiltradas.length > 0;
    } else {
      this.mostrarSugerenciasMaterias = false;
    }
  }

  seleccionarMateria(materia: string) {
    this.materia = materia;
    this.mostrarSugerenciasMaterias = false;
    
    // Cargar tareas previas de esta materia
    this.cargarTareasPrevias(materia);
  }

  private cargarTareasPrevias(materia: string) {
    const materiaKey = materia.toLowerCase().trim();
    const tareasPrevias = this.tareasPreviasMaterias[materiaKey] || [];
    
    // Buscar evaluación existente de la misma materia y tipo
    this.evaluacionExistenteInfo = this.historial.find(evaluacion => 
      evaluacion.materia.toLowerCase().trim() === materiaKey &&
      evaluacion.tipo === this.tipo &&
      evaluacion.usuarioId === this.usuarioActual!.id
    ) || null;
    
    if (tareasPrevias.length > 0) {
      // Mostrar las tareas previas como sugerencias para que el usuario pueda elegir
      this.mostrarTareasPrevias = true;
      this.tareasPreviasDisponibles = tareasPrevias;
    } else {
      this.mostrarTareasPrevias = false;
      this.tareasPreviasDisponibles = [];
    }
  }

  // Variables para mostrar tareas previas
  mostrarTareasPrevias = false;
  tareasPreviasDisponibles: Array<{titulo: string, descripcion: string}> = [];

  agregarTareaPreviaAlFormulario(tareaPrev: {titulo: string, descripcion: string}) {
    // Buscar el primer campo de tarea vacío o agregar uno nuevo
    let indiceVacio = this.titulosTareas.findIndex(titulo => !titulo || titulo.trim() === '');
    
    if (indiceVacio === -1) {
      // No hay campos vacíos, agregar uno nuevo
      this.agregarCalificacion();
      indiceVacio = this.titulosTareas.length - 1;
    }
    
    // Llenar los datos de la tarea
    this.titulosTareas[indiceVacio] = tareaPrev.titulo;
    this.descripcionesTareas[indiceVacio] = tareaPrev.descripcion;
    
    // Enfocar el campo de calificación
    setTimeout(() => {
      const calInput = document.querySelector(`input[name="cal${indiceVacio}"]`) as HTMLInputElement;
      if (calInput) {
        calInput.focus();
      }
    }, 100);
  }

  ocultarSugerenciasMaterias() {
    // Pequeño delay para permitir que el click en la sugerencia se procese
    setTimeout(() => {
      this.mostrarSugerenciasMaterias = false;
    }, 200);
  }

  ocultarTareasPrevias() {
    this.mostrarTareasPrevias = false;
  }

  // Método que se llama cuando cambia el tipo de evaluación
  onTipoChange() {
    // Recargar tareas previas y verificar evaluaciones existentes si hay una materia seleccionada
    if (this.materia && this.materia.trim()) {
      this.cargarTareasPrevias(this.materia);
    }
  }
}
