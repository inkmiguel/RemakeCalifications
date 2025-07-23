import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ChartOptions, ChartData, ChartType } from 'chart.js';
import { AuthService } from '../../services/auth.service';
import { Usuario, EvaluacionHistorial } from '../DB';
import { Firestore, collection, addDoc, query, where, collectionData, orderBy } from '@angular/fire/firestore';
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
    });
  }

  async guardarEvaluacion(promedio: number, resultadoTexto: string) {
    if (!this.usuarioActual) return;

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
  agregarCalificacion(): void {
    this.calificaciones.push(null);
    this.titulosTareas.push('');
    this.fechasTareas.push('');
    this.descripcionesTareas.push('');
  }

  agregarExamen(): void {
    this.calExamenes.push(null);
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
    // Solo aceptar valores entre 0 y 100
    if (!isNaN(valor) && valor >= 0 && valor <= 100) {
      this.calificaciones[index] = valor;
      // Si es el último campo y tiene un valor válido mayor a 0, agregar un nuevo campo
      if (index === this.calificaciones.length - 1 && valor > 0) {
        this.agregarCalificacion();
      }
    } else if (valor > 100) {
      // Si el valor es mayor a 100, lo ignoramos y dejamos el valor anterior
      this.calificaciones[index] = 100;
    }
  }

  onExamenChange(index: number, event: any): void {
    const inputValue = event.target.value;
    if (inputValue === '' || inputValue === null) {
      this.calExamenes[index] = null as any;
      return;
    }
    const valor = parseFloat(inputValue);
    // Solo aceptar valores entre 0 y 100
    if (!isNaN(valor) && valor >= 0 && valor <= 100) {
      this.calExamenes[index] = valor;
      if (index === this.calExamenes.length - 1 && valor > 0) {
        this.agregarExamen();
      }
    } else if (valor > 100) {
      // Si el valor es mayor a 100, lo ajustamos a 100
      this.calExamenes[index] = 100;
    }
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
    
    // Guardar en el historial si el usuario está logueado
    if (this.usuarioLogueado && this.usuarioActual) {
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
}
