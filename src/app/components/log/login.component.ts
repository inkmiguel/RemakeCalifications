import { Component } from "@angular/core";
import { Firestore, collection, collectionData, doc, query, setDoc, where, deleteDoc, orderBy } from "@angular/fire/firestore";
import { Route, Router } from "@angular/router";
import { Usuario } from "../DB";
import { AuthService } from "../../services/auth.service";

@Component({
    selector: 'app-login',
    templateUrl: './login.html',
    styleUrls: ['./login.css']
})
export class LoginComponent {
    public usuarios: Usuario = new Usuario();
    usuariosDB = collection(this.firestore, 'usuarios');
    constructor(private firestore: Firestore, private route: Router, private authService: AuthService) {
        this.usuarios = new Usuario();
     }
     login(){
        const QuerySearchUser = query(
            this.usuariosDB,
            where('email', '==', this.usuarios.email),
            where('password', '==', this.usuarios.password),
        )
        collectionData(QuerySearchUser, { idField: 'id' }).subscribe((GetUser: any[]) => {
            if (GetUser.length > 0) {
                const usuario = GetUser[0] as Usuario;
                this.authService.login(usuario);
                this.route.navigate(['/home']);
            } else {
                alert('Usuario o contraseña incorrectos');
            }
        })
     };

     // Método para navegar al registro
     goToSignup() {
        this.route.navigate(['/signup']);
     }
}