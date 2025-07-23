import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Usuario } from '../components/DB/Usuario';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private usuarioLogueadoSubject = new BehaviorSubject<Usuario | null>(null);
  public usuarioLogueado$ = this.usuarioLogueadoSubject.asObservable();

  constructor() {
    // Verificar si hay un usuario guardado en localStorage al iniciar
    const usuarioGuardado = localStorage.getItem('usuarioLogueado');
    if (usuarioGuardado) {
      this.usuarioLogueadoSubject.next(JSON.parse(usuarioGuardado));
    }
  }

  login(usuario: Usuario) {
    this.usuarioLogueadoSubject.next(usuario);
    localStorage.setItem('usuarioLogueado', JSON.stringify(usuario));
  }

  logout() {
    this.usuarioLogueadoSubject.next(null);
    localStorage.removeItem('usuarioLogueado');
  }

  getCurrentUser(): Usuario | null {
    return this.usuarioLogueadoSubject.value;
  }

  isLoggedIn(): boolean {
    return this.usuarioLogueadoSubject.value !== null;
  }
}
