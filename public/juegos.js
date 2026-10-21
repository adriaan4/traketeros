// Preguntas para las cartas de los juegos. Contenido cerrado: no hace falta tocar esto.

const PREGUNTAS = {
  yo_nunca: [
  'Yo nunca lo he hecho con mas de una persona en un mismo dia.',
  'Yo nunca he querido tirarme a la madre/padre de un amigo/a.',
  'Yo nunca he querido tirarme al hermano/a de un amigo/a.',
  'Yo nunca me he querido liar con alguien presente.',
  'Yo nunca he tenido fantasias sexuales sobre alguien que no considerase atractivo/a.',
  'Yo nunca lo he hecho a pelo.',
  'Yo nunca he acabado en la boca de alguien/ me han acabado en la boca.',
  'Yo nunca he querido tirarme al novio/a de un amigo/a.',
  'A mi nunca me han pedido que fuese mas lento porque iba demasiado rapido.',
  'Yo nunca he dejado con las ganas a alguien.',
  'A mi nunca me han dejado con las ganas.',
  'Yo nunca he tenido la tipica discusion de "luces encendidas/ apagadas".',
  'Yo nunca me he encontrado un pelo en la boca tras hacer oral.',
  'Yo nunca he puesto los cuernos.',
  'A mi nunca me han puesto los cuernos.',
  'Yo nunca me he liado con dos personas de distinto sexo en una noche.',
  'Yo nunca me he liado con alguien y me he arrepentido inmediatamente despues.',
  'Yo nunca he tenido sexo por pena.',
  'Yo nunca me he tirado a mi ex.',
  'A mi nunca me han pillado en el acto.',
  'Yo nunca lo he hecho en un lugar publico.',
  'Yo nunca lo he hecho en la cama de una tercera persona.',
  'Yo nunca lo he hecho con mas gente al rededor.',
  'Yo nunca he hecho un trio.',
  'Yo nunca he tenido fantasias sexuales sobre hacer un trio con mi novio/a y otra persona.',
  'Yo nunca me he masturbado con un objeto inanimado.',
  'Yo nunca me he hecho daño a mi mismo al masturbarme.',
  'Yo nunca me he decepcionado al liarme/tirarme a alguien con quien tenia muchas ganas.',
  'Yo nunca he practicado sadomasoquismo o usado objetos relacionados.',
  'Yo nunca he intentado anal pero no salio bien.',
  'Yo nunca he practicado anal por placer.',
  'Yo nunca he hecho algo sexual con alguien más de 4 años mayor.',
  'Yo nunca he hecho algo sexual en el colegio/universidad.',
  'A mi nunca me han hecho un chupeton en un lugar poco comun.',
  'Yo nunca he intentado emborrachar a alguien para liarme con esa persona.',
  'Yo nunca he visto porno con otra persona.',
  'Yo nunca me he grabado con alguien en la cama.',
  'Yo nunca me he masturbado con una pelicula que no fuese pornografica.',
  'Yo nunca me he dejado el matojillo pensando que no iba a triunfar y triunfé.',
  'Yo nunca he tenido un gatillazo.',
  'Yo nunca lo he hecho con la regla.',
  'Yo nunca me he querido liar con mas de 2 personas presentes.',
  'Yo nunca lo he hecho disfrazado para satisfacer algun morbo.',
  'Yo nunca me he liado con el chico/a con quien estaba intentando ligar un amigo/a.',
  'Yo nunca me lo he tragado.',
  'Yo nunca me he excitado en un momento muy poco apropiado.',
  'A mi nunca se me ha roto el condon.',
  'Yo nunca he estado un año sin sexo tras haberlo hecho previamente.',
  'Yo nunca he puesto/a mi nunca me han puesto un condon con la boca.',
  'Yo nunca he involucrado comida en el sexo.',
  'Yo nunca lo he hecho en una fiesta.',
  'Yo nunca me he tomado/he comprado la pastilla del dia despues.',
  'Yo nunca he tenido sexo por telefono.',
  'Yo nunca he tenido que correr a buscar mi ropa porque acababan de tocar el timbre de la casa.',
  'Yo nunca me he liado/tirado con alguien que cursaba mi misma carrera.',
  'Yo nunca me he liado/tirado a el/la ex de un amigo/a.',
  'Yo nunca le he mentido sobre mis experiencias sexuales a mi nueva pareja.',
  'Yo nunca he tenido que enseñar/a mi nunca me han tenido que enseñar como desabrochar un sujetador o cinturon.',
  'Yo nunca he tenido una fantasia sexual sobre un profesor/profesora.',
  'Yo nunca he pillado a mis padres haciendolo.',
  'Yo nunca me he sacado fotos desnudo/a.',
  'Yo nunca he llamado a alguien por un nombre equivocado mientras lo estabamos haciendo.',
  'Yo nunca he/a mi nunca me han lamido el culo.',
  'Yo nunca lo he hecho en la ducha.',
  'Yo nunca he usado el kamasutra para aprender o involucrar nuevas posiciones en la cama.',
  'Yo nunca lo he hecho con alguien que era virgen.',
  'Yo nunca he mentido sobre ser virgen.',
  'Yo nunca me he medido el pene.',
  'Yo nunca he borrado conversaciones subidas de tono para que mi pareja no me pillase.',
  'Yo nunca me he liado/ tirado a alguien que no me parecia atractivo/a solo porque estaba desesperado/a.',
  'Yo nunca he creido haber contraido una enfermedad de transmision sexual.',
  'Yo nunca he fingido/exagerado un orgasmo.',
  'Yo nunca he tenido un follamigo/a.',
  'Yo nunca he salido de casa sin ropa interior.',
  'Yo nunca me he liado/tirado a un extranjero/a.',
  'Yo nunca he sentido envidia al ver los genitales de un amigo/a.',
  'Yo nunca me he masturbado en casa de un amigo/a.',
  'Yo nunca he hecho/a mi nunca me han hecho una mamada con condon.',
  'Yo nunca he usado hielo en la cama.',
  'Yo nunca he pedido que satisfacieran un fetiche mio pero sin exito.',
  'Yo nunca he intentado esconder una ereccion en publico sin exito.',
  'A mi nunca me ha puesto la violencia en la cama.',
  'Yo nunca me he tirado/se han tirado un pedo en el acto.',
  'Yo nunca le he roto la ropa a mi pareja al quitarsela.',
  'Yo nunca he intentado/querido que una pareja rompiese.',
  'Yo nunca he hecho/me han hecho una cubana.',
  'Yo nunca me he masturbado viendo hentai.',
  'Yo nunca he aceptado hacer algo por dinero.',
  'Yo nunca he metido/me han metido mas de 3 dedos.',
  'Yo nunca lo he hecho en un coche y sono la bocina.',
  'A mi nunca me han tenido que enseñar una foto de con quien me habia liado porque no me acordaba.',
  'Yo nunca me he depilado los genitales pensando que iba a pinchar y acabe comiendome los mocos.',
  'Yo nunca he querido unirme a dos amigos que estuviesen haciendolo.',
  'Yo nunca he hecho una lista de todas los tios/tias con las que me he liado.',
  'Yo nunca he conseguido liarme/tirarme a un amor platonico.',
  'Yo nunca he tenido que usar mas de 2 condones en una misma ronda.',
  'Yo nunca lo he hecho en todos los cuartos de mi/su casa.',
  'Yo nunca he tenido que usar paginas online o aplicaciones para ligar.',
  'Yo nunca me he dado cuenta de que me estaban mirando mientras lo estaba haciendo.',
  'Yo nunca me he liado con alguien presente.',
  'Yo nunca me he liado/tirado a alguien que me cayera mal.',
  'A mi nunca se me han/yo nunca he acabado encima del cuerpo.',
  'A mi nunca me han dado una hostia por estar tirando la caña.',
  'Yo nunca me he arrepentido de con quien habia perdido la virginidad.',
  'Yo nunca me he liado con alguien que acababa de vomitar.',
  'A mi nunca me ha puesto alguien sin saber en su momento que esa persona tenia minimo 4 años menos que yo.',
  'Yo nunca he salido con alguien con quien sabia que no iba a estar mucho tiempo.',
  'Yo nunca he hecho un 69.',
  'Yo nunca lo he hecho con mis/sus padres cerca.',
  'Yo nunca he ligado con alguien para poner celoso/a a una persona.',
  'Yo nunca me he resbalado mientras lo hacia en la ducha.',
  'Yo nunca le he dicho a alguien "te quiero" solo para follar.',
  'Yo nunca he hecho/a mi nunca me han hecho sangrar al meter dedos.',
  'Yo nunca he echado un polvo malisimo.',
  'Yo nunca me he masturbado al menos 5 veces en un dia.',
  'Yo nunca he tenido un sueño mojado.',
  'Yo nunca he pensado que el sexo oral era asqueroso.',
  'Yo nunca he pensado que el sexo oral es mejor que la penetracion.',
  'Yo nunca he pensado en otra persona mientras estaba haciendolo con alguien.',
  'Yo nunca he pensado de alguien con quien estoy/estaba que tiene el pene pequeño.',
  'Yo nunca he usado condones con sabores.',
  'Yo nunca he/a mi nunca se me han acabado dentro sin condon.',
  'Yo nunca me he guardado las fotos de mi ex desnudo/a despues de haber cortado con el/ella.',
  'Yo nunca he usado/nunca han usado conmigo la marcha atras como metodo anticonceptivo.',
  'Yo nunca me he liado con alguien que tenia novio/a.',
  'A mi nunca me ha tirado la caña un familiar de mi novio/a.',
  'Yo nunca he mandado a la friendzone a alguien tras haberme liado con esa persona.',
  'Yo nunca me he alegrado por algo malo que le haya pasado a mi ex.',
  'Yo nunca lo he hecho mas de 5 veces en un dia.',
  'Yo nunca me he liado con alguien de mi actual clase.',
  'Yo nunca me he arrepentido de un tatuaje.',
  'A mi nunca me ha dado mas morbo hacerlo fuera de casa que dentro.',
  'Yo nunca me he quedado dormido/a durante el sexo.',
  'Yo nunca me he pillado por alguien mientras tenia novio/a.',
  'Yo nunca he cortado con un novio/a porque el sexo no me satisfacia.',
  'Yo nunca he roto la cama al hacerlo.',
  'A mi nunca me han llamado la atencion los vecinos por hacer demasiado ruido durante el sexo.',
  'Yo nunca he/a mi nunca me han agarrado del pelo con fuerza en el sexo.',
  'Yo nunca he aguantado menos de 10 minutos en la cama.',
  'Nunca han aguantado menos de 10 minutos en la cama conmigo.',
  'Yo nunca lo he hecho 3 o mas veces seguidas.',
  'Yo nunca he/a mi nunca me han despertado con una mamada/polvo.',
  'Yo nunca me he masturbado mientras hacia una videollamada con alguien.',
  'Yo nunca me he creado una cuenta falsa en alguna red social para ver lo que hacia un/a ex sin que se diese cuenta.',
  'Yo nunca he conseguido liarme o salir con alguien con quien estaba previamente en la friendzone.',
  'A mi nunca me han pillado un chupeton mis padres.',
  'Yo nunca tendria una relacion con alguien presente si se diese el caso.',
  'Yo nunca he visto porno de hermanastros/padrastros/madrastas.',
  'Yo nunca he/a mi nunca me han hecho garganta profunda.',
  'Yo nunca me he sentido mal conmigo mismo tras tocarme.',
  'Yo nunca le he seguido el rollo a un profesora/a que me estuviese tirando.',
  'Yo nunca he pedido hacer un video porno pero sin exito.',
  'Yo nunca he fingido ser de otra nacionalidad para ligar.',
  'Yo nunca he tenido sexo interracial.',
  'Yo nunca he estado frustrado porque no me satisfacia el sexo con una persona a quien queria.',
  'Yo nunca me he masturbado en grupo.',
  'Yo nunca me he obsesionado entera o parcialmente con alguien tras liarme con esa persona una vez.',
  'Yo nunca he lamido unos pezones.',
  'A mi nunca me han lamido los pezones.',
  'Yo nunca he estado en la friendzone con alguien presente.',
  'Yo nunca he cortado con alguien para salir con otra persona.',
  'Nunca han cortado conmigo para salir con otra persona.',
  'Yo nunca lo he hecho estando enfermo.',
  'Yo nunca me he querido tirar/tirado a mi mejor amigo/a.',
  'Yo nunca he preferido los culos a las tetas.',
  'Yo nunca he tenido pique con el novio/a de mi ex.',
  'Yo nunca he pensado que me casaria con un ex o actual pareja.',
  'Yo nunca he soñado que me liaba/tiraba a alguien y me he decepcionado al despertarme.',
  'Yo nunca me he liado con alguien que tenia muy mal aliento.',
  'A mi nunca me han hecho daño al practicar sexo oral.',
  'Yo nunca he tenido la paranoia de estar embarazada porque se me habia retrasado la regla.',
  'Yo nunca he/a mi nunca me han hecho una mamada conduciendo.',
  'Yo nunca le he seguido el rollo a alguien que me estaba tirando solo para conseguir alcohol.',
  'Yo nunca he visto un juguete sexual y he sentido intriga.',
  'Yo nunca he tenido un sueño sexual sobre alguien presente/de la clase.',
  'Yo nunca he sentido intriga por practicar sexo oral con alguien de mi mismo sexo.',
  'Yo nunca he pensado que el sexo entre mismo sexo es o seria mejor que el sexo entre distintos sexos.',
  'Yo nunca he sentido atraccion por algun familiar.',
  'Yo nunca he chupado un pene/coño que supiera muy mal.',
  'A mi nunca me ha interrumpido mi mascota mientras estaba haciendolo.',
  'Yo nunca me he/nunca se han equivocado de agujero.',
  'Yo nunca me he masturbado justo antes de hacerlo para durar mas.',
  'Yo nunca he usado un video porno como modelo a seguir.',
  'Yo nunca me he vestido de cierta forma para atraer la atencion de alguien y paso de mi.',
  'Yo nunca he alquilado una habitacion de hotel o motel solo para follar.',
  'Yo nunca haria un trio con gente aqui presente.',
  'Yo nunca he jugado a algun juego con el castigo de hacer un striptease.',
  'Yo nunca me he liado con alguien que besase realmente mal.',
  'Yo nunca he usado el movil mientras lo estaba haciendo.',
  'Yo nunca lo he hecho manteniendo 0 contacto visual con la otra persona.',
  'A mi nunca me ha tirado para atras ver cuanto pelo pubico tenia la persona con la que lo iba a hacer.',
  'Yo nunca me he reido mientras lo estaba haciendo.',
  'Yo nunca he tirado la caña de broma y acabo saliendo mejor de lo que esperaba.',
  'Yo nunca me he liado/tirado al mejor amigo/a de mi ex.',
  'Yo nunca he me hecho fotos sensuales desnudo/a para enviarselas a alguien.',
  'Yo nunca he creido que alguien presente me ha tirado la caña alguna vez.',
  'Yo nunca me he liado con alguien que ha querido tener algo conmigo despues sin que yo quisiera.',
  'Yo nunca me he liado/tirado a alguien que no he vuelto a ver en mi vida.',
  'Yo nunca me he imaginado como serian las tetas/el pene de alguien presente.',
  'Yo nunca me habria tirado a alguien de clase principio de curso pero ahora me da asco.',
  'Yo nunca he hecho/provocado squirting.',
  'Yo nunca he/a mi nunca me han ocasionado moratones o arañazos en el sexo.',
  'Yo nunca he/a mi nunca me han dado un pollazo en la cara.',
  'Yo nunca he/a mi nunca me han tirado la caña para conseguir alcohol.',
  'Yo nunca lo he hecho con musica de fondo.',
  'Yo nunca me he liado/tirado a alguien que estaba muy por encima de mis posibilidades.',
  'Yo nunca he tenido una cita de donde creia que podia surgir algo y acabe decepcionandome.',
  'A mi nunca me han intentado emborrachar para liarse conmigo.',
  'Yo nunca he mentido sobre mi mismo para ligar.',
  'Yo nunca lo he hecho estando borracho/fumado.',
  'Yo nunca le he robado condones a un familiar.',
  'Yo nunca me he llevado condones pensando que iba a pinchar y acabe dandoselos a alguien.',
  'Yo nunca he jugado a roles en la cama.',
  'Yo nunca he usado saliva como lubricante.',
  'Yo nunca me he liado 2 o mas veces con alguien con quien no tenia nada.',
  'Yo nunca he negado liarme con alguien pese a ser verdad.',
  'Yo nunca he dormido en la misma cama con alguien del sexo opuesto sin que pasara nada.',
  'Yo nunca me he liado con mas de 10 personas en toda mi vida.',
  'Yo nunca he chantajeado a alguien con contar un secreto suyo.',
  'Yo nunca me he enterado de cuernos a un amigo/a y lo he ocultado por alguna razon.',
  'Yo nunca he estado mas de un mes sin masturbarme.',
  'Yo nunca he pasado de los preliminares y he ido directo/a al sexo.',
  'Yo nunca me he quedado en los preliminares porque no me apetecia el sexo.',
  'Yo nunca he dejado un polvo a mitad por cualquier razon.',
  'Yo nunca me he asustado al ver el tamaño del pene de alguien.',
  'Yo nunca me he liado con alguien de mi club/equipo.',
  'Yo nunca me he liado con alguien justo despues de potar.',
  'Yo nunca me he dado cuenta de que me estaban mirando mientras meaba.',
  'Yo nunca he tenido arcadas al hacer oral.',
  'A mi nunca me ha puesto alguien que no considerase atractivo/a.',
  'Yo nunca he/a mi nunca me han hecho una mamada bajo el agua.',
  'Yo nunca he rechazado a un/una ex que queria volver a liarse conmigo.',
  'Yo nunca lo he hecho en otro pais.',
  'Yo nunca me he masturbado con una foto.',
  'Yo nunca he pensado en una vieja o un animal mientras lo hacia para durar mas.',
  'Yo nunca he comprado algo en un sex shop.',
  'Yo nunca le he hecho un baile sensual a mi pareja.',
  'Yo nunca me he encarado con alguien que estuviese mirando o molestando a mi pareja.',
  'A mi nunca me han retado a liarme con alguien.',
  'Yo nunca me he masturbado pensando en alguien que no fuese mi pareja en ese momento.',
  'Yo nunca me he liado/tirado a alguien a quien le tenia ganas mientras tenia novio/a.',
  'Yo nunca lo he hecho sin quitarme la mayoria de la ropa.',
  'Yo nunca he tenido un/una ex que se cambio de acera despues de dejarlo conmigo.',
  'Yo nunca le he hecho la cobra a alguien que me habia rechazado previamente por venganza.',
  'Yo nunca he puesto cachondo/a a alguien con un simple susurro al oido.',
  'Yo nunca lo he hecho justo despues de discutir para reconciliarnos.',
  'Yo nunca volveria con un/una ex.',
  'Yo nunca me volveria a liar con alguien presente.',
  'Yo nunca lo he hecho en solo una posicion todo el rato.',
  'Yo nunca lo he hecho en al rededor de 10 posiciones.',
  'Yo nunca he estado un mes sin hacerlo teniendo pareja.',
  'Yo nunca he acabado encima de mi propio cuerpo sin querer.',
  'A mi nunca me han puesto tanto que me han hecho temblar.',
  'A mi nunca se me ha dormido una parte del cuerpo mientras lo hacia.',
  'A mi nunca se me ha perdido algo dentro de alguien/de mi mismo/a.',
  'Yo nunca he tenido que parar para preguntar si iba todo bien.',
  'A mi nunca me han propuesto un trio seriamente.',
  'Yo nunca he archivado un chat porque no queria que mi pareja lo viera pero tampoco queria borrarlo.',
  'Yo nunca he negado masturbarme.',
  'Yo nunca me he excitado/empalmado cuando me han perreado en una fiesta.',
  'A mi nunca me han usado para poner celoso/a a alguien.',
  'Yo nunca he estado en la cama con alguien del sexo opuesto pero solo hubo besos.',
  'Yo nunca me he rascado los genitales en publico y me han visto.',
  'Yo nunca lo he hecho con los calcetines puestos.',
  'Yo nunca me he negado a hacerle oral a alguien que me lo habia pedido.',
  'Yo nunca me he liado con un chico mas bajito/una chica mas alta que yo.',
  'Yo nunca lo he hecho con gafas.',
  'Yo nunca me he liado con alguien con quien no deberia haberlo hecho por ir borracho/a.',
  'Yo nunca he tenido complejo sobre alguna parte de mi cuerpo.',
  'Yo nunca lo he hecho justo antes de dormirme y al despertarme.',
  'A mi nunca me ha tirado la caña alguien pensando que era de otra orientacion sexual.',
  'Yo nunca he aceptado hacer/que me hicieran algo que no queria solo para follar.',
  'Yo nunca he hecho que alguien hiciera algo que no queria con el sexo como recompensa.',
  'Yo nunca he recibido fotos de alguien desnudo/a.',
  'Yo nunca le he estado mirando las tetas a una chica y me ha pillado de pleno.',
  'A mi nunca me ha puesto mas hacerlo sin condon.',
  'Yo nunca he acabado y he continuado sin parar.',
  'Yo nunca he querido tirarme al hermano/a de mi pareja o de un/a ex.',
  'Yo nunca he dejado un mancha en la ropa o en la cama.',
  'Yo nunca he sido dominante en la cama.',
  'Yo nunca me he masturbado en una ducha que no fuese la mia.',
  'Yo nunca le he contado a alguien que habia follado inmediatamente despues de hacerlo.',
  'Yo nunca lo he hecho en una bañera.',
  'Yo nunca lo he hecho en el suelo.',
  'A mi nunca me han visto haciendo cualquier cosa sexual en el cine.',
  'Yo nunca me he sentido atraída/o por alguien 5 años mayor que yo.',
  'Yo nunca he tenido sexo esta ultima semana.',
  'Yo nunca me he masturbado hoy.',
  'Yo nunca he sudado mucho/bastante durante el sexo.',
  'Yo nunca he buscado consejos sexuales en internet.',
  'A mi nunca me ha gustado mas estar debajo que encima.',
  'A mi nunca me ha gustado mas estar encima que debajo.',
  'Yo nunca he salido con alguien a quien no queria.',
  'Yo nunca he tenido un amigo/a que se ha liado con mi ex.',
  'A mi nunca me ha hecho una cobra alguien presente.',
  'Yo nunca le he hecho una cobra a alguien presente.',
  'Yo nunca me he masturbado en otro pais.',
  'Yo nunca me he liado con alguien solo porque un amigo/a me ayudo.',
  'Yo nunca me he masturbado con amigo/as en casa.',
  'Yo nunca me he masturbado pensando en alguien menor que yo.',
  'Yo nunca he tonteado/ligado con alguien con quien no tenia ningun interes en quedar.',
  'Yo nunca me he pillado por alguien con quien no podria tener nada.'
  ],
  mas_probable: [
  '¿Quién es más probable que tenga un crush secreto?',
  '¿Quién es más probable que dé el primer paso?',
  '¿Quién es más probable que se enamore primero?',
  '¿Quién es más probable que vuelva con su ex?',
  '¿Quién es más probable que bese a alguien en una fiesta?',
  '¿Quién es más probable que tenga una cita improvisada?',
  '¿Quién es más probable que coquetee con alguien solo por diversión?',
  '¿Quién es más probable que mande un mensaje de madrugada a su crush?',
  '¿Quién es más probable que stalkee a alguien en redes?',
  '¿Quién es más probable que se ponga celoso/a y lo niegue?',
  '¿Quién es más probable que tenga dos crushes a la vez?',
  '¿Quién es más probable que se lie con alguien inesperado?',
  '¿Quién es más probable que se enamore de un amigo/a?',
  '¿Quién es más probable que tenga una relación secreta?',
  '¿Quién es más probable que se arrepienta de un beso?',
  '¿Quién es más probable que diga “solo somos amigos” cuando claramente hay química?',
  '¿Quién es más probable que provoque celos a propósito?',
  '¿Quién es más probable que tenga un flechazo en cinco minutos?',
  '¿Quién es más probable que se quede hablando con alguien hasta el amanecer?',
  '¿Quién es más probable que rompa el corazón de alguien sin querer?',
  '¿Quién es más probable que tenga una cita a escondidas?',
  '¿Quién es más probable que se declare primero?',
  '¿Quién es más probable que tenga química con alguien totalmente inesperado?',
  '¿Quién es más probable que vuelva a escribir después de decir “nunca más”?',
  '¿Quién es más probable que tenga un crush con alguien de este grupo?',
  '¿Quién es más probable que se ponga nervioso/a cuando alguien le gusta?',
  '¿Quién es más probable que confunda amistad con tensión romántica?',
  '¿Quién es más probable que acepte una cita por pura curiosidad?',
  '¿Quién es más probable que tenga una historia de amor de película?',
  '¿Quién es más probable que termine la noche con un nuevo crush?',
  '¿Quién es más probable que tenga una cita que dure hasta la madrugada?',
  '¿Quién es más probable que se haga el/la difícil?',
  '¿Quién es más probable que deje en visto a propósito?',
  '¿Quién es más probable que responda al instante a su crush?',
  '¿Quién es más probable que tenga un amor platónico imposible?',
  '¿Quién es más probable que se enganche demasiado rápido?',
  '¿Quién es más probable que se arrepienta de no haber dado el primer paso?',
  '¿Quién es más probable que tenga una cita en un lugar extraño?',
  '¿Quién es más probable que tenga un crush con alguien prohibido o complicado?',
  '¿Quién es más probable que haga match y nunca escriba?',
  '¿Quién es más probable que ligue sin darse cuenta?',
  '¿Quién es más probable que se enamore de alguien que no le conviene?',
  '¿Quién es más probable que mantenga una conversación de coqueteo durante horas?',
  '¿Quién es más probable que tenga una cita doble que termine en drama?',
  '¿Quién es más probable que tenga una historia que nadie conoce completa?',
  '¿Quién es más probable que se vaya de viaje con alguien que acaba de conocer?',
  '¿Quién es más probable que tenga una relación de verano?',
  '¿Quién es más probable que se reconcilie con alguien del pasado?',
  '¿Quién es más probable que tenga un crush por alguien famoso?',
  '¿Quién es más probable que tenga una cita con alguien totalmente diferente a su tipo?',
  '¿Quién es más probable que se enamore por la personalidad?',
  '¿Quién es más probable que se enamore por una sonrisa?',
  '¿Quién es más probable que se fije primero en los ojos?',
  '¿Quién es más probable que se fije primero en la voz?',
  '¿Quién es más probable que tenga mariposas por alguien del grupo?',
  '¿Quién es más probable que oculte que alguien le gusta?',
  '¿Quién es más probable que se ponga rojo/a al recibir un cumplido?',
  '¿Quién es más probable que haga un cumplido descarado?',
  '¿Quién es más probable que mande un emoji con doble sentido?',
  '¿Quién es más probable que escriba “te echo de menos” primero?',
  '¿Quién es más probable que diga “me gustas” primero?',
  '¿Quién es más probable que tenga una cita sorpresa?',
  '¿Quién es más probable que organice una escapada romántica?',
  '¿Quién es más probable que escriba una carta de amor?',
  '¿Quién es más probable que dedique una canción?',
  '¿Quién es más probable que tenga una playlist para su crush?',
  '¿Quién es más probable que guarde capturas de conversaciones románticas?',
  '¿Quién es más probable que relea mensajes de alguien que le gusta?',
  '¿Quién es más probable que revise quién ha visto sus historias?',
  '¿Quién es más probable que publique una indirecta?',
  '¿Quién es más probable que mande una indirecta por redes?',
  '¿Quién es más probable que responda a una historia para ligar?',
  '¿Quién es más probable que empiece a seguir a su crush después de verlo una vez?',
  '¿Quién es más probable que quite y vuelva a poner un like?',
  '¿Quién es más probable que borre un mensaje por vergüenza?',
  '¿Quién es más probable que escriba y borre un mensaje diez veces?',
  '¿Quién es más probable que pregunte a sus amigos qué responder?',
  '¿Quién es más probable que investigue a su crush antes de una cita?',
  '¿Quién es más probable que se prepare durante horas para una cita?',
  '¿Quién es más probable que llegue tarde a una cita por ponerse demasiado guapo/a?',
  '¿Quién es más probable que tenga una cita que empiece como amistad?',
  '¿Quién es más probable que se enamore de su compañero/a de trabajo o clase?',
  '¿Quién es más probable que tenga tensión con alguien que no debería?',
  '¿Quién es más probable que tenga un crush en secreto desde hace meses?',
  '¿Quién es más probable que lleve meses esperando que alguien dé el primer paso?',
  '¿Quién es más probable que bese a alguien que acaba de conocer?',
  '¿Quién es más probable que tenga un flechazo en una discoteca?',
  '¿Quién es más probable que ligue durante un viaje?',
  '¿Quién es más probable que tenga un romance de vacaciones?',
  '¿Quién es más probable que conozca a alguien especial en una fiesta?',
  '¿Quién es más probable que acabe teniendo una cita por una apuesta?',
  '¿Quién es más probable que se deje convencer para una cita?',
  '¿Quién es más probable que diga que no quiere una relación y termine enamorado/a?',
  '¿Quién es más probable que empiece algo sin querer?',
  '¿Quién es más probable que tenga una relación de amigos con química?',
  '¿Quién es más probable que tenga tensión romántica con su mejor amigo/a?',
  '¿Quién es más probable que tenga una cita con alguien que antes odiaba?',
  '¿Quién es más probable que pase de “no me gusta” a “me encanta”?',
  '¿Quién es más probable que cambie de opinión después de un beso?',
  '¿Quién es más probable que se quede pensando en alguien durante días?',
  '¿Quién es más probable que tenga un crush por alguien que no conoce bien?',
  '¿Quién es más probable que se enamore por una conversación profunda?',
  '¿Quién es más probable que tenga una cita inolvidable?',
  '¿Quién es más probable que tenga una cita desastrosa pero divertida?',
  '¿Quién es más probable que cuente una anécdota romántica vergonzosa?',
  '¿Quién es más probable que tenga una cita con alguien que conoció online?',
  '¿Quién es más probable que se quede hasta el final de una fiesta por alguien?',
  '¿Quién es más probable que cambie sus planes por ver a su crush?',
  '¿Quién es más probable que cancele otros planes por una cita?',
  '¿Quién es más probable que organice una cita secreta?',
  '¿Quién es más probable que tenga una cita nocturna espontánea?',
  '¿Quién es más probable que invite a alguien a salir sin pensarlo demasiado?',
  '¿Quién es más probable que se arrepienta de haber enviado un mensaje?',
  '¿Quién es más probable que mande un “¿qué haces?” sin motivo?',
  '¿Quién es más probable que mande un “buenas noches” con intención?',
  '¿Quién es más probable que mande un “buenos días” todos los días?',
  '¿Quién es más probable que se quede mirando a su crush desde lejos?',
  '¿Quién es más probable que sonría al ver una notificación concreta?',
  '¿Quién es más probable que reconozca a su crush por la forma de caminar?',
  '¿Quién es más probable que se acuerde de todos los detalles de una cita?',
  '¿Quién es más probable que prepare un regalo romántico?',
  '¿Quién es más probable que recuerde una fecha importante?',
  '¿Quién es más probable que haga una sorpresa romántica?',
  '¿Quién es más probable que sea muy cariñoso/a en privado?',
  '¿Quién es más probable que sea más coqueto/a en persona que por chat?',
  '¿Quién es más probable que sea más coqueto/a por chat que en persona?',
  '¿Quién es más probable que tenga una mirada que lo diga todo?',
  '¿Quién es más probable que se quede sin palabras ante su crush?',
  '¿Quién es más probable que tenga química instantánea?',
  '¿Quién es más probable que tenga una conversación que empiece como broma y termine en coqueteo?',
  '¿Quién es más probable que haga una apuesta romántica?',
  '¿Quién es más probable que acepte un reto de ligar?',
  '¿Quién es más probable que tenga una cita por una apuesta?',
  '¿Quién es más probable que se atreva a invitar a salir a alguien delante de todos?',
  '¿Quién es más probable que confiese un crush en este juego?',
  '¿Quién es más probable que elija a alguien del grupo para una cita?',
  '¿Quién es más probable que tenga que responder “sí” si le preguntan por su crush?',
  '¿Quién es más probable que se ponga nervioso/a si le toca alguien concreto?',
  '¿Quién es más probable que evite mirar a su crush durante el juego?',
  '¿Quién es más probable que se delate con una sonrisa?',
  '¿Quién es más probable que diga un nombre que nadie esperaba?',
  '¿Quién es más probable que tenga un secreto romántico?',
  '¿Quién es más probable que confiese algo que lleva meses ocultando?',
  '¿Quién es más probable que admita que alguien de aquí le parece atractivo/a?',
  '¿Quién es más probable que tenga una tensión no resuelta con alguien?',
  '¿Quién es más probable que tenga una historia pendiente con alguien del grupo?',
  '¿Quién es más probable que vuelva a hablar con alguien del pasado esta semana?',
  '¿Quién es más probable que reciba una declaración inesperada?',
  '¿Quién es más probable que reciba una invitación a una cita mañana?',
  '¿Quién es más probable que tenga un admirador secreto?',
  '¿Quién es más probable que descubra que alguien del grupo tiene un crush por él/ella?',
  '¿Quién es más probable que tenga un pretendiente secreto?',
  '¿Quién es más probable que sea el crush secreto de alguien del grupo?',
  '¿Quién es más probable que tenga más de una persona interesada en él/ella?',
  '¿Quién es más probable que reciba más mensajes de coqueteo?',
  '¿Quién es más probable que tenga más matches de los que admite?',
  '¿Quién es más probable que tenga una conversación subida de tono pero sin pasar de ahí?',
  '¿Quién es más probable que mande un mensaje coqueto y luego se arrepienta?',
  '¿Quién es más probable que haga una llamada nocturna a alguien que le gusta?',
  '¿Quién es más probable que se quede hablando por teléfono hasta dormirse?',
  '¿Quién es más probable que se duerma pensando en alguien?',
  '¿Quién es más probable que sueñe con su crush?',
  '¿Quién es más probable que tenga una cita romántica bajo las estrellas?',
  '¿Quién es más probable que tenga una cita en la playa?',
  '¿Quién es más probable que tenga una cita en un viaje?',
  '¿Quién es más probable que organice una cena romántica?',
  '¿Quién es más probable que prepare una sorpresa para alguien que le gusta?',
  '¿Quién es más probable que tenga una noche de película con tensión romántica?',
  '¿Quién es más probable que convierta una noche normal en una cita?',
  '¿Quién es más probable que termine cenando con su crush después de salir?',
  '¿Quién es más probable que se quede hablando en la puerta de casa durante una hora?',
  '¿Quién es más probable que no quiera despedirse de su crush?',
  '¿Quién es más probable que invente una excusa para volver a ver a alguien?',
  '¿Quién es más probable que busque cualquier motivo para hablar con alguien?',
  '¿Quién es más probable que recuerde exactamente qué llevaba su crush el día que lo conoció?',
  '¿Quién es más probable que tenga una foto favorita de alguien?',
  '¿Quién es más probable que tenga un apodo cariñoso para su crush?',
  '¿Quién es más probable que use un apodo romántico demasiado pronto?',
  '¿Quién es más probable que se ponga celoso/a de un comentario en redes?',
  '¿Quién es más probable que pregunte “¿quién era esa persona?”?',
  '¿Quién es más probable que finja indiferencia cuando está celoso/a?',
  '¿Quién es más probable que quiera exclusividad antes?',
  '¿Quién es más probable que se enamore después de una amistad larga?',
  '¿Quién es más probable que tarde meses en reconocer sus sentimientos?',
  '¿Quién es más probable que niegue estar enamorado/a?',
  '¿Quién es más probable que tenga miedo de confesar lo que siente?',
  '¿Quién es más probable que arriesgue una amistad por amor?',
  '¿Quién es más probable que dé una segunda oportunidad?',
  '¿Quién es más probable que perdone a su ex?',
  '¿Quién es más probable que mantenga contacto con un ex?',
  '¿Quién es más probable que sea amigo/a de su ex?',
  '¿Quién es más probable que vuelva a caer con la misma persona?',
  '¿Quién es más probable que tenga una historia de “casi algo”?',
  '¿Quién es más probable que siga pensando en un “casi algo”?',
  '¿Quién es más probable que convierta un “casi algo” en algo real?',
  '¿Quién es más probable que tenga sentimientos por alguien que no puede tener?',
  '¿Quién es más probable que se enamore de alguien a distancia?',
  '¿Quién es más probable que mantenga una relación a distancia?',
  '¿Quién es más probable que se mude por amor?',
  '¿Quién es más probable que viaje solo para ver a alguien?',
  '¿Quién es más probable que espere meses por alguien?',
  '¿Quién es más probable que escriba primero después de una discusión?',
  '¿Quién es más probable que pida perdón primero?',
  '¿Quién es más probable que haga las paces con un abrazo?',
  '¿Quién es más probable que convierta una discusión en una reconciliación romántica?',
  '¿Quién es más probable que sea muy intenso/a cuando le gusta alguien?',
  '¿Quién es más probable que se obsesione con una canción por alguien?',
  '¿Quién es más probable que dedique indirectas en una playlist?',
  '¿Quién es más probable que escriba un poema para su crush?',
  '¿Quién es más probable que haga un dibujo para alguien que le gusta?',
  '¿Quién es más probable que guarde un recuerdo de una cita?',
  '¿Quién es más probable que conserve una entrada de cine de una cita?',
  '¿Quién es más probable que tenga una foto de una cita como fondo de pantalla?',
  '¿Quién es más probable que se ponga nervioso/a al recibir flores?',
  '¿Quién es más probable que regale flores?',
  '¿Quién es más probable que regale algo hecho a mano?',
  '¿Quién es más probable que prepare una cita temática?',
  '¿Quién es más probable que tenga una cita elegante?',
  '¿Quién es más probable que tenga una cita completamente espontánea?',
  '¿Quién es más probable que diga “vamos a ver qué pasa” y termine enamorado/a?',
  '¿Quién es más probable que tenga una conexión especial con alguien nuevo?',
  '¿Quién es más probable que crea en el amor a primera vista?',
  '¿Quién es más probable que se enamore de una voz?',
  '¿Quién es más probable que se enamore de una mirada?',
  '¿Quién es más probable que se enamore de alguien por su sentido del humor?',
  '¿Quién es más probable que se enamore de alguien por su inteligencia?',
  '¿Quién es más probable que tenga una debilidad por alguien concreto?',
  '¿Quién es más probable que tenga un “tipo” muy definido?',
  '¿Quién es más probable que rompa su propio tipo por alguien?',
  '¿Quién es más probable que diga que nunca saldría con alguien y luego lo haga?',
  '¿Quién es más probable que salga con alguien completamente inesperado?',
  '¿Quién es más probable que tenga una historia romántica que empiece por casualidad?',
  '¿Quién es más probable que conozca a su próxima pareja por amigos?',
  '¿Quién es más probable que conozca a su próxima pareja en una fiesta?',
  '¿Quién es más probable que conozca a su próxima pareja por internet?',
  '¿Quién es más probable que conozca a alguien especial viajando?',
  '¿Quién es más probable que tenga una cita que nadie más del grupo se atrevería a tener?',
  '¿Quién es más probable que haga algo romántico sin avisar?',
  '¿Quién es más probable que sorprenda a su crush apareciendo de repente?',
  '¿Quién es más probable que haga una declaración delante de todos?',
  '¿Quién es más probable que bese a alguien para romper la tensión?',
  '¿Quién es más probable que tenga química con alguien con quien discute mucho?',
  '¿Quién es más probable que convierta una rivalidad en romance?',
  '¿Quién es más probable que tenga un enemigo que en realidad le gusta?',
  '¿Quién es más probable que tenga una relación de “nos caemos mal pero…”?',
  '¿Quién es más probable que termine saliendo con alguien que conoció en una discusión?',
  '¿Quién es más probable que tenga una historia romántica llena de giros?',
  '¿Quién es más probable que se meta en un triángulo amoroso?',
  '¿Quién es más probable que tenga dos personas interesadas en él/ella al mismo tiempo?',
  '¿Quién es más probable que tenga que elegir entre dos crushes?',
  '¿Quién es más probable que rechace una cita y luego se arrepienta?',
  '¿Quién es más probable que acepte una cita después de decir que no?',
  '¿Quién es más probable que dé una segunda oportunidad a alguien?',
  '¿Quién es más probable que tenga una cita con alguien que conoció hace años?',
  '¿Quién es más probable que reencuentre un antiguo crush?',
  '¿Quién es más probable que se vuelva a enamorar de alguien del pasado?',
  '¿Quién es más probable que tenga un crush secreto durante todo un año?',
  '¿Quién es más probable que nunca confiese un crush?',
  '¿Quién es más probable que confiese un crush durante este juego?',
  '¿Quién es más probable que mande un mensaje justo después de terminar este juego?',
  '¿Quién es más probable que salga de este juego con una nueva cita?',
  '¿Quién es más probable que salga de este juego con un nuevo crush?',
  '¿Quién es más probable que termine esta noche hablando a solas con alguien?',
  '¿Quién es más probable que reciba una invitación a una cita al terminar?',
  '¿Quién es más probable que dé su número a alguien esta noche?',
  '¿Quién es más probable que pida el Instagram de alguien esta noche?',
  '¿Quién es más probable que haga match con alguien del grupo?',
  '¿Quién es más probable que tenga una cita con alguien que está aquí?',
  '¿Quién es más probable que ya haya tenido un crush por alguien de aquí?',
  '¿Quién es más probable que todavía tenga un crush por alguien de aquí?',
  '¿Quién es más probable que haya besado a alguien del grupo en secreto?',
  '¿Quién es más probable que quiera repetir una cita que ya tuvo?',
  '¿Quién es más probable que diga “una última pregunta” y siga jugando media hora?',
  '¿Quién es más probable que se ría cuando le toca una pregunta comprometida?',
  '¿Quién es más probable que se niegue a responder porque la respuesta sería demasiado obvia?',
  '¿Quién es más probable que señale a la misma persona varias veces?',
  '¿Quién es más probable que sea señalado/a por casi todo el grupo?',
  '¿Quién es más probable que descubra algo inesperado sobre alguien esta noche?',
  '¿Quién es más probable que tenga la respuesta más polémica?',
  '¿Quién es más probable que provoque el mayor salseo?',
  '¿Quién es más probable que haga que todos griten al decir un nombre?',
  '¿Quién es más probable que se quede callado/a porque conoce demasiado bien la respuesta?',
  '¿Quién es más probable que tenga una confesión pendiente?',
  '¿Quién es más probable que salga de aquí con una nueva historia que contar?',
  '¿Quién es más probable que tenga un momento romántico inesperado en los próximos días?'
  ],
  bebe_el_que: [
  'Bebe el que …haya mentido para librarse de un plan.',
  'Bebe el que …haya stalkeado a alguien y haya llegado demasiado lejos.',
  'Bebe el que …haya enviado un mensaje y lo haya borrado inmediatamente.',
  'Bebe el que …haya tenido un crush secreto y nadie lo supiera.',
  'Bebe el que …haya fingido que no le gustaba alguien cuando sí.',
  'Bebe el que …haya dejado a alguien en visto aposta.',
  'Bebe el que …haya cotilleado conversaciones ajenas.',
  'Bebe el que …haya inventado una excusa para hablar con alguien.',
  'Bebe el que …haya revisado quién ha visto su historia más de una vez.',
  'Bebe el que …haya puesto una indirecta esperando que alguien concreto la viera.',
  'Bebe el que …haya borrado una historia porque no recibió la reacción que esperaba.',
  'Bebe el que …haya tenido celos y haya fingido que no.',
  'Bebe el que …haya hablado mal de alguien y luego haya actuado normal con esa persona.',
  'Bebe el que …haya vuelto a hablar con alguien después de decir «no le vuelvo a hablar».',
  'Bebe el que …haya fingido estar ocupado para no contestar.',
  'Bebe el que …haya mandado un mensaje al chat equivocado.',
  'Bebe el que …haya hecho una captura de pantalla para enseñársela al grupo.',
  'Bebe el que …haya tenido una discusión por una tontería y después se haya arrepentido.',
  'Bebe el que …haya intentado dar celos a alguien.',
  'Bebe el que …haya hecho como que no veía a alguien para evitar saludar.',
  'Bebe el que …haya tenido una conversación entera ensayada mentalmente antes de tenerla.',
  'Bebe el que …haya mentido sobre dónde estaba.',
  'Bebe el que …haya inventado una historia para quedar mejor.',
  'Bebe el que …haya dicho «me da igual» cuando claramente no le daba igual.',
  'Bebe el que …haya tenido un crush por alguien que no debería.',
  'Bebe el que …haya cambiado de look o estilo por impresionar a alguien.',
  'Bebe el que …haya buscado información de alguien antes de conocerlo.',
  'Bebe el que …haya reconocido a alguien por sus fotos antes de que esa persona se presentara.',
  'Bebe el que …haya confundido amabilidad con interés.',
  'Bebe el que …haya pensado «¿y si…?» sobre alguien del grupo.',
  'Bebe el que …haya tenido una amistad que parecía algo más.',
  'Bebe el que …haya hecho una apuesta absurda por alguien.',
  'Bebe el que …haya guardado una foto porque le gustaba especialmente cómo salía alguien.',
  'Bebe el que …haya tenido una conversación que jamás enseñaría al grupo.',
  'Bebe el que …haya dicho «no voy a caer otra vez» y haya caído otra vez.',
  'Bebe el que …haya vuelto a mirar el perfil de alguien después de decir que lo había superado.',
  'Bebe el que …haya tenido una pelea por culpa de un malentendido.',
  'Bebe el que …haya fingido no saber algo que sabía perfectamente.',
  'Bebe el que …haya dado un consejo que ni siquiera sigue.',
  'Bebe el que …haya tenido una historia que empieza con «no debería contar esto».',
  'Bebe el que …haya enviado una indirecta y luego haya fingido que era casualidad.',
  'Bebe el que …haya borrado un mensaje porque sonaba demasiado intenso.',
  'Bebe el que …haya preguntado a un amigo qué responder a un mensaje.',
  'Bebe el que …haya tardado muchísimo en elegir una foto para subir.',
  'Bebe el que …haya mirado varias veces si alguien estaba conectado.',
  'Bebe el que …haya dicho que no le interesaba alguien y después haya preguntado por esa persona.',
  'Bebe el que …haya tenido una conversación pendiente durante meses.',
  'Bebe el que …haya hecho como que no le importaba una situación para no quedar mal.',
  'Bebe el que …haya cambiado de opinión después de hablar con sus amigos.',
  'Bebe el que …haya tenido un flechazo inesperado.',
  'Bebe el que …haya pensado que alguien le estaba tirando indirectas y luego no era así.',
  'Bebe el que …haya enviado una reacción a una historia solo para iniciar conversación.',
  'Bebe el que …haya mantenido una conversación únicamente porque le interesaba conocer mejor a alguien.',
  'Bebe el que …haya fingido reconocer una referencia que no entendía.',
  'Bebe el que …haya contado un secreto y después se haya arrepentido.',
  'Bebe el que …haya pedido opinión al grupo antes de tomar una decisión personal.',
  'Bebe el que …haya tenido una conversación incómoda que todavía recuerda.',
  'Bebe el que …haya intentado hacer quedar bien a alguien que le importaba.',
  'Bebe el que …haya hecho una indirecta demasiado obvia.',
  'Bebe el que …haya pensado que una amistad podía convertirse en algo diferente.'
  ]
};
const $ = (id) => document.getElementById(id);

// Categorías y palabras para el juego del Impostor. Los jugadores normales
// reciben la palabra exacta; el impostor solo recibe el nombre de la
// categoría de la que ha salido esa palabra, a modo de pista.
const CATEGORIAS_IMPOSTOR = [
  { grupo: '🔥 Difíciles', nombre: 'Futbolistas', palabras: ['Mbappé', 'Vinícius Jr.', 'Haaland', 'Bellingham', 'Lamine Yamal', 'Rodri', 'Pedri', 'Nico Williams', 'Julián Álvarez', 'Musiala'] },
  { grupo: '🔥 Difíciles', nombre: 'Marcas de ropa', palabras: ['Nike', 'Adidas', 'Puma', 'New Balance', 'Jordan', 'Lacoste', 'Tommy Hilfiger', 'Calvin Klein', 'The North Face', "Levi's"] },
  { grupo: '🔥 Difíciles', nombre: 'Coches', palabras: ['BMW', 'Mercedes', 'Audi', 'Porsche', 'Ferrari', 'Lamborghini', 'Tesla', 'Cupra', 'Volkswagen', 'Toyota'] },
  { grupo: '🔥 Difíciles', nombre: 'Redes sociales', palabras: ['Instagram', 'TikTok', 'Snapchat', 'WhatsApp', 'Telegram', 'Twitter/X', 'Twitch', 'YouTube', 'Discord', 'BeReal'] },
  { grupo: '🔥 Difíciles', nombre: 'Comida', palabras: ['Pizza', 'Hamburguesa', 'Kebab', 'Burrito', 'Taco', 'Nachos', 'Panini', 'Hot dog', 'Sándwich', 'Shawarma'] },
  { grupo: '🔥 Difíciles', nombre: 'Bebidas', palabras: ['Coca-Cola', 'Pepsi', 'Fanta', 'Sprite', 'Aquarius', 'Red Bull', 'Monster', 'Nestea', 'Cerveza', 'Agua con gas'] },
  { grupo: '🔥 Difíciles', nombre: 'Países', palabras: ['España', 'Portugal', 'Italia', 'Francia', 'Grecia', 'Croacia', 'Argentina', 'Brasil', 'México', 'Colombia'] },
  { grupo: '🔥 Difíciles', nombre: 'Ciudades', palabras: ['Madrid', 'Barcelona', 'Sevilla', 'Valencia', 'Málaga', 'Lisboa', 'París', 'Roma', 'Londres', 'Nueva York'] },
  { grupo: '🔥 Difíciles', nombre: 'Videojuegos', palabras: ['GTA V', 'Fortnite', 'Minecraft', 'Call of Duty', 'EA Sports FC', 'Rocket League', 'Valorant', 'FIFA', 'Roblox', 'Among Us'] },
  { grupo: '🔥 Difíciles', nombre: 'Películas / sagas', palabras: ['Harry Potter', 'Star Wars', 'Marvel', 'Fast & Furious', 'Jurassic Park', 'Toy Story', 'Shrek', 'El Señor de los Anillos', 'Piratas del Caribe', 'Transformers'] },
  { grupo: '🔥 Difíciles', nombre: 'Famosos / creadores', palabras: ['Ibai', 'El Rubius', 'AuronPlay', 'IlloJuan', 'TheGrefg', 'MrBeast', 'Jordi Wild', 'Quevedo', 'Bad Bunny', 'Bizarrap'] },
  { grupo: '🔥 Difíciles', nombre: 'Animales', palabras: ['León', 'Tigre', 'Jaguar', 'Leopardo', 'Guepardo', 'Pantera', 'Puma', 'Lobo', 'Zorro', 'Hiena'] },

  { grupo: '☠️ Muy difíciles', nombre: 'Futbolistas españoles', palabras: ['Pedri', 'Gavi', 'Dani Olmo', 'Mikel Merino', 'Fabián Ruiz', 'Rodri', 'Nico Williams', 'Ferran Torres', 'Dani Carvajal', 'Martín Zubimendi'] },
  { grupo: '☠️ Muy difíciles', nombre: 'Clubes de fútbol', palabras: ['Real Madrid', 'Atlético de Madrid', 'Sevilla', 'Valencia', 'Villarreal', 'Real Betis', 'Athletic Club', 'Real Sociedad', 'Celta', 'Getafe'] },
  { grupo: '☠️ Muy difíciles', nombre: 'Marcas de lujo', palabras: ['Rolex', 'Gucci', 'Prada', 'Dior', 'Louis Vuitton', 'Versace', 'Armani', 'Balenciaga', 'Chanel', 'Burberry'] },
  { grupo: '☠️ Muy difíciles', nombre: 'Apps', palabras: ['Instagram', 'TikTok', 'Snapchat', 'Telegram', 'WhatsApp', 'Discord', 'Twitch', 'Spotify', 'Netflix', 'Uber'] },
  { grupo: '☠️ Muy difíciles', nombre: 'Lugares de fiesta', palabras: ['Discoteca', 'Pub', 'Bar', 'Sala de conciertos', 'Festival', 'Karaoke', 'Casino', 'Playa', 'Chiringuito', 'Terraza'] },
  { grupo: '☠️ Muy difíciles', nombre: 'Objetos cotidianos', palabras: ['Móvil', 'Llaves', 'Cartera', 'Auriculares', 'Reloj', 'Gafas', 'Mochila', 'Cargador', 'Mando', 'Mechero'] },
  { grupo: '☠️ Muy difíciles', nombre: 'Profesiones', palabras: ['Policía', 'Bombero', 'Médico', 'Enfermero', 'Abogado', 'Profesor', 'Periodista', 'Camarero', 'Piloto', 'Futbolista'] },
  { grupo: '☠️ Muy difíciles', nombre: 'Lugares', palabras: ['Hotel', 'Hospital', 'Aeropuerto', 'Estación', 'Colegio', 'Gimnasio', 'Cárcel', 'Centro comercial', 'Parque', 'Universidad'] },

  { grupo: '💀 Nivel imposible', nombre: 'Cosas redondas', palabras: ['Pelota', 'Moneda', 'Reloj', 'Plato', 'Rueda', 'Donut', 'Globo', 'Anillo', 'CD', 'Galleta'] },
  { grupo: '💀 Nivel imposible', nombre: 'Cosas que hacen ruido', palabras: ['Moto', 'Aspiradora', 'Taladro', 'Secador', 'Microondas', 'Lavadora', 'Altavoz', 'Sirena', 'Timbre', 'Avión'] },
  { grupo: '💀 Nivel imposible', nombre: 'Cosas de una discoteca', palabras: ['DJ', 'Barra', 'Altavoces', 'Luces', 'Pista', 'Vasos', 'Camarero', 'Seguridad', 'Sofá', 'Baño'] },
  { grupo: '💀 Nivel imposible', nombre: 'Cosas de un estadio', palabras: ['Césped', 'Gradas', 'Portería', 'Marcador', 'Árbitro', 'Banquillo', 'Vestuario', 'Focos', 'Aficionados', 'Megafonía'] },
  { grupo: '💀 Nivel imposible', nombre: 'Cosas que llevas de viaje', palabras: ['Maleta', 'Pasaporte', 'Móvil', 'Cargador', 'Dinero', 'Auriculares', 'Ropa', 'Cepillo de dientes', 'Gafas de sol', 'Mochila'] }
];

// ---------- Estado del Impostor ----------
const imp = {
  jugadores: [],           // nombres
  categorias: new Set(),   // índices seleccionados de CATEGORIAS_IMPOSTOR
  numImpostores: 1,
  roles: [],               // paralelo a jugadores: true = impostor
  palabra: '',
  categoriaUsada: '',
  turno: 0,
  fase: 0                  // 0=nombre, 1=revelado, 2=ya visto
};

function impActualizarBoton1() {
  const min = 3;
  $('impError1').textContent = '';
  const ok = imp.jugadores.length >= min;
  $('impContinuar1').disabled = !ok;

  // El número de impostores nunca puede llegar a todos los jugadores.
  const maxImp = Math.max(1, imp.jugadores.length - 1);
  const input = $('impNumImpostores');
  input.max = String(maxImp);

  // Solo recortamos si ya hay un número escrito fuera de rango. Si el campo
  // está vacío (el usuario lo ha borrado para escribir otro número) lo dejamos
  // tal cual, si no, no le deja escribir nada que no sea 1 o el máximo.
  if (input.value !== '') {
    const val = Number(input.value);
    if (val > maxImp) input.value = String(maxImp);
    else if (val < 1) input.value = '1';
  }
}

function impRenderLista() {
  const ul = $('impLista');
  ul.replaceChildren();
  imp.jugadores.forEach((nombre, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = nombre;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'imp-quitar';
    btn.textContent = 'Quitar';
    btn.setAttribute('aria-label', `Quitar a ${nombre}`);
    btn.addEventListener('click', () => {
      imp.jugadores.splice(i, 1);
      impRenderLista();
      impActualizarBoton1();
    });
    li.append(span, btn);
    ul.append(li);
  });
  $('impVacio').hidden = imp.jugadores.length > 0;
}

$('impAddForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('impNombre');
  const nombre = input.value.trim().slice(0, 20);
  if (!nombre) return;
  imp.jugadores.push(nombre);
  input.value = '';
  input.focus();
  impRenderLista();
  impActualizarBoton1();
});

$('impNumImpostores').addEventListener('input', impActualizarBoton1);
$('impNumImpostores').addEventListener('blur', () => {
  if ($('impNumImpostores').value === '') $('impNumImpostores').value = '1';
  impActualizarBoton1();
});

$('impContinuar1').addEventListener('click', () => {
  if (imp.jugadores.length < 3) {
    $('impError1').textContent = 'Necesitáis al menos 3 personas para jugar.';
    return;
  }
  const maxImp = imp.jugadores.length - 1;
  let n = Math.round(Number($('impNumImpostores').value) || 1);
  if (n < 1) n = 1;
  if (n > maxImp) n = maxImp;
  imp.numImpostores = n;

  impRenderCategorias();
  $('impPaso1').hidden = true;
  $('impPaso2').hidden = false;
});

function impRenderCategorias() {
  const cont = $('impCategorias');
  cont.replaceChildren();
  let grupoActual = null;
  let lista = null;

  CATEGORIAS_IMPOSTOR.forEach((cat, i) => {
    if (cat.grupo !== grupoActual) {
      grupoActual = cat.grupo;
      const titulo = document.createElement('div');
      titulo.className = 'imp-categorias-grupo';
      titulo.textContent = grupoActual;
      cont.append(titulo);
      lista = document.createElement('div');
      lista.className = 'imp-categorias-lista';
      cont.append(lista);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'imp-cat-btn';
    btn.textContent = cat.nombre;
    btn.classList.toggle('active', imp.categorias.has(i));
    btn.addEventListener('click', () => {
      if (imp.categorias.has(i)) imp.categorias.delete(i);
      else imp.categorias.add(i);
      btn.classList.toggle('active', imp.categorias.has(i));
      $('impContinuar2').disabled = imp.categorias.size === 0;
    });
    lista.append(btn);
  });

  $('impContinuar2').disabled = imp.categorias.size === 0;
}

$('impVolver2').addEventListener('click', () => {
  $('impPaso2').hidden = true;
  $('impPaso1').hidden = false;
});

$('impContinuar2').addEventListener('click', () => {
  if (imp.categorias.size === 0) {
    $('impError2').textContent = 'Elige al menos una categoría.';
    return;
  }
  $('impError2').textContent = '';
  impRepartir();
  $('impPaso2').hidden = true;
  $('impPaso3').hidden = false;
});

// Baraja los papeles y elige la palabra al azar entre TODAS las categorías
// marcadas (una sola palabra, no una por categoría).
function impRepartir() {
  const pool = [];
  imp.categorias.forEach((i) => {
    const cat = CATEGORIAS_IMPOSTOR[i];
    cat.palabras.forEach((palabra) => pool.push({ palabra, categoria: cat.nombre }));
  });
  const elegida = pool[Math.floor(Math.random() * pool.length)];
  imp.palabra = elegida.palabra;
  imp.categoriaUsada = elegida.categoria;

  const orden = barajar(imp.jugadores.length);
  imp.roles = imp.jugadores.map(() => false);
  orden.slice(0, imp.numImpostores).forEach((i) => { imp.roles[i] = true; });

  imp.turno = 0;
  impMostrarTurno();
}

function impMostrarTurno() {
  const nombre = imp.jugadores[imp.turno];
  imp.fase = 0;
  $('impTurnoHint').textContent = `Pásale el móvil a ${nombre} (que nadie más mire) 👀`;

  const carta = $('impCartaJugador');
  carta.className = 'imp-carta';
  carta.textContent = nombre;
  carta.hidden = false;
  const btnSiguiente = $('impSiguienteJugador');
  btnSiguiente.hidden = true;
  btnSiguiente.disabled = true;
}

$('impCartaJugador').addEventListener('click', () => {
  const carta = $('impCartaJugador');
  const esImpostor = imp.roles[imp.turno];

  if (imp.fase === 0) {
    imp.fase = 1;
    carta.classList.add('revelado');
    if (esImpostor) {
      carta.classList.add('es-impostor');
      carta.innerHTML = `🕵️ Eres el <strong>IMPOSTOR</strong><br>Pista: ${imp.categoriaUsada}`;
    } else {
      carta.innerHTML = `🤫 La palabra es:<br><strong>${imp.palabra}</strong>`;
    }
  } else if (imp.fase === 1) {
    imp.fase = 2;
    carta.className = 'imp-carta visto';
    carta.textContent = 'Ya lo has visto ✅ — pásasela a la siguiente persona';
    const btnSiguiente = $('impSiguienteJugador');
    btnSiguiente.hidden = false;
    btnSiguiente.disabled = false;
  }
});

// Por si acaso: aunque el botón esté oculto, nunca deja pasar a la siguiente
// persona si todavía no ha visto su palabra/rol (fase < 2).
$('impSiguienteJugador').addEventListener('click', (e) => {
  if (imp.fase < 2) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

$('impSiguienteJugador').addEventListener('click', () => {
  imp.turno++;
  if (imp.turno < imp.jugadores.length) {
    impMostrarTurno();
  } else {
    $('impPaso3').hidden = true;
    $('impPaso4').hidden = false;
    const idx = Math.floor(Math.random() * imp.jugadores.length);
    $('impEmpieza').textContent = `🎲 Empieza ${imp.jugadores[idx]}`;
  }
});

$('impRevelar').addEventListener('click', () => {
  const impostores = imp.jugadores.filter((_, i) => imp.roles[i]);
  const texto = impostores.length > 1
    ? `🕵️ Los impostores eran: ${impostores.join(', ')}`
    : `🕵️ El impostor era: ${impostores[0]}`;
  const revelado = $('impRevelado');
  revelado.textContent = texto;
  revelado.hidden = false;
});

function impOcultarRevelado() {
  const revelado = $('impRevelado');
  revelado.hidden = true;
  revelado.textContent = '';
}

$('impOtraRonda').addEventListener('click', () => {
  impOcultarRevelado();
  $('impPaso4').hidden = true;
  $('impPaso3').hidden = false;
  impRepartir();
});

$('impReiniciar').addEventListener('click', () => {
  impOcultarRevelado();
  imp.jugadores = [];
  imp.categorias = new Set();
  imp.numImpostores = 1;
  imp.roles = [];
  imp.turno = 0;
  $('impNumImpostores').value = '1';
  impRenderLista();
  impActualizarBoton1();
  $('impError1').textContent = '';
  $('impPaso4').hidden = true;
  $('impPaso1').hidden = false;
});

impRenderLista();
impActualizarBoton1();

// ---------- Lógica del juego ----------

const MODOS = {
  yo_nunca: { etiqueta: 'Yo nunca', emoji: '🙊', preguntas: PREGUNTAS.yo_nunca },
  mas_probable: { etiqueta: 'Quién es más probable', emoji: '👉', preguntas: PREGUNTAS.mas_probable },
  bebe_el_que: { etiqueta: 'Bebe el que', emoji: '🍺', preguntas: PREGUNTAS.bebe_el_que }
};

let modoActual = 'yo_nunca';
let mazo = [];       // índices que quedan por salir en esta vuelta
let vistas = 0;

function barajar(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nuevaVuelta(avisar) {
  const modo = MODOS[modoActual];
  mazo = barajar(modo.preguntas.length);
  vistas = 0;
  if (avisar) {
    $('vuelta').hidden = false;
  } else {
    $('vuelta').hidden = true;
  }
}

function actualizarContador() {
  const modo = MODOS[modoActual];
  $('contador').textContent = `${vistas} / ${modo.preguntas.length}`;
}

function siguienteCarta() {
  const modo = MODOS[modoActual];

  if (mazo.length === 0) {
    nuevaVuelta(vistas > 0);
    if (vistas === 0) return; // recién barajado, no mostramos aviso la primera vez
  } else {
    $('vuelta').hidden = true;
  }

  const idx = mazo.pop();
  vistas++;
  $('pregunta').textContent = modo.preguntas[idx];
  $('badge').textContent = `${modo.emoji} ${modo.etiqueta}`;
  actualizarContador();
}

function cambiarModo(clave) {
  modoActual = clave;
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.modo === clave);
  });

  const esImpostor = clave === 'impostor';
  $('carta').hidden = esImpostor;
  $('gameControls').hidden = esImpostor;
  $('impostor').hidden = !esImpostor;

  if (!esImpostor) {
    nuevaVuelta(false);
    siguienteCarta();
  }
}

document.querySelectorAll('.tab').forEach((b) => {
  b.addEventListener('click', () => cambiarModo(b.dataset.modo));
});

$('siguiente').addEventListener('click', siguienteCarta);
$('carta').addEventListener('click', siguienteCarta);

cambiarModo('yo_nunca');
