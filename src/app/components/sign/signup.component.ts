import { Component } from "@angular/core";
import { Firestore, collection, collectionData, doc, query, setDoc, where, deleteDoc, orderBy } from "@angular/fire/firestore";
import { Router } from "@angular/router";
import { Usuario, generarID } from "../DB";

@Component({
    selector: 'app-signup',
    templateUrl: './signup.html',
    styleUrls: ['./signup.css']
})
export class SignupComponent {
    public usuarios: Usuario = new Usuario();
    public confirmPassword: string = '';
    usuariosDB = collection(this.firestore, 'usuarios');

    constructor(private firestore: Firestore, private route: Router) {
        this.usuarios = new Usuario();
    }

    // Método para verificar si el usuario ya existe
    private checkIfUserExists(): Promise<boolean> {
        const queryCheckUser = query(
            this.usuariosDB,
            where('email', '==', this.usuarios.email)
        );
        
        return new Promise((resolve) => {
            collectionData(queryCheckUser).subscribe((existingUsers) => {
                resolve(existingUsers.length > 0);
            });
        });
    }

    async signup() {
        try {
            // Validar que las contraseñas coincidan
            if (this.usuarios.password !== this.confirmPassword) {
                alert('Las contraseñas no coinciden');
                return;
            }

            // Validar longitud mínima de contraseña
            if (this.usuarios.password.length < 6) {
                alert('La contraseña debe tener al menos 6 caracteres');
                return;
            }

            // Verificar si el usuario ya existe
            const userExists = await this.checkIfUserExists();
            
            if (userExists) {
                alert('Este correo electrónico ya está registrado. Por favor, usa otro correo o inicia sesión.');
                return;
            }

            // Si no existe, proceder con el registro
            this.usuarios.id = generarID(20);
            const newUserRef = doc(this.usuariosDB, this.usuarios.id);
            await setDoc(newUserRef, {
                id: this.usuarios.id,
                name: this.usuarios.name,
                email: this.usuarios.email,
                password: this.usuarios.password,
                tipoUsuario: this.usuarios.tipoUsuario
            });
            
            alert('Usuario registrado exitosamente');
            this.route.navigate(['/']);
            
        } catch (error) {
            console.error("Error al registrar el usuario: ", error);
            alert('Error al registrar el usuario');
        }
    }

    // Método para navegar al login
    goToLogin() {
        this.route.navigate(['/login']);
    }
}