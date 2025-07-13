import { Component } from "@angular/core";
import { Firestore, collection, collectionData, doc, query, setDoc, where, deleteDoc, orderBy } from "@angular/fire/firestore";
import { Route, Router } from "@angular/router";
import { Usuario } from "../DB";

@Component({
    selector: 'app-login',
    templateUrl: './login.html',
    styleUrls: ['./login.css']
})
export class LoginComponent {
    public usuarios: Usuario = new Usuario();
    usuariosDB = collection(this.firestore, 'usuarios');
    constructor(private firestore: Firestore, private route: Router) {
        this.usuarios = new Usuario();
     }
     login(){
        const QuerySearchUser = query(
            this.usuariosDB,
            where('email', '==', this.usuarios.email),
            where('password', '==', this.usuarios.password),
        )
        collectionData(QuerySearchUser).subscribe((GetUser) => {
            if (GetUser.length > 0) {
                this.route.navigate(['/home']);
            } else {
                alert('Usuario o contraseña incorrectos');
            }
        })
     };
}